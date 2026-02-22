/**
 * POST /api/prepare-tryon-prompt.
 * Только Fal (FAL_KEY): Fal chat → Fal proxy. OpenAI не вызываем. Иначе возвращаем единый стандартный промпт для всех моделей.
 */

/** Единый стандартный промпт для всех моделей (KIE, Fal). Совпадает с api/generate-image.ts. OpenAI не вызываем. */
const DEFAULT_IMAGE_PROMPT =
  'Put the garment from the second image onto the person in the first image. Preserve character consistency, garment consistency, and body shape. Dress naturally, beautifully and stylishly this outfit from the photo. Background: soft beige-gray or light concrete, clean and distraction-free. Style: hyper-realistic high-end fashion photography. Lighting: soft directional side light with subtle rim light. Mood: premium, confident, modern. Composition: rule of thirds, subject centered, vertical frame. Camera: Sony A7R V, 85mm f/1.8. Format: vertical.';

const FAL_CHAT_MODEL = 'fal-ai/Mixtral-8x7B-Instruct-v0.1';

/** Уведомить админа о сбое (токены, fallback). Если задан ADMIN_WEBHOOK_URL — POST туда; всегда лог [ADMIN]. */
function notifyAdmin(reason: string, detail: Record<string, unknown>): void {
  const payload = { reason, ...detail, ts: new Date().toISOString() };
  console.error('[prepare-tryon-prompt] [ADMIN]', JSON.stringify(payload));
  const webhook = process.env.ADMIN_WEBHOOK_URL;
  if (webhook) {
    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((e) => console.error('[prepare-tryon-prompt] [ADMIN] webhook failed', e));
  }
}

/** Fal LLM (Mixtral и т.п.): текстовый чат по FAL_KEY. */
async function callFalChat(systemPrompt: string, userContent: string, signal?: AbortSignal): Promise<string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error('FAL_KEY not set');

  const url = `https://queue.fal.run/${FAL_CHAT_MODEL}`;
  // Fal queue REST ожидает поля в корне тела (как для nano-banana), без обёртки "input"
  const payload = {
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fal chat ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    output?: { choices?: Array<{ message?: { content?: string } }> };
    data?: { choices?: Array<{ message?: { content?: string } }> };
  };
  const content =
    data.output?.choices?.[0]?.message?.content ?? data.data?.choices?.[0]?.message?.content;
  const prompt = typeof content === 'string' ? content.trim() : '';
  if (!prompt) throw new Error('Fal chat returned empty content');
  return prompt;
}

/** OpenAI-совместимый прокси для Fal (Cloudflare Worker). Один сброс — сразу в следующую. */
async function callFalViaOpenAIProxy(messages: Array<{ role: string; content: string }>, signal?: AbortSignal): Promise<string> {
  const proxyUrl = process.env.FAL_OPENAI_PROXY_URL;
  const proxyKey = process.env.FAL_PROXY_API_KEY;
  if (!proxyUrl || !proxyKey) throw new Error('FAL_OPENAI_PROXY_URL or FAL_PROXY_API_KEY not set');

  const chatUrl = proxyUrl.includes('/v1/chat/completions')
    ? proxyUrl
    : proxyUrl.replace(/\/?$/, '') + '/v1/chat/completions';
  const res = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${proxyKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FAL_CHAT_MODEL,
      messages,
      max_tokens: 256,
      temperature: 0.7,
    }),
    signal,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fal proxy ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const prompt = data.choices?.[0]?.message?.content?.trim();
  if (!prompt) throw new Error('Fal proxy returned empty content');
  return prompt;
}

/** Только Fal: Fal chat → Fal proxy. OpenAI не вызываем. */
async function tryAlternativesForPrompt(
  garmentImageBase64: string,
  garmentJson?: Record<string, string>,
  signal?: AbortSignal
): Promise<{ prompt: string; source: string } | null> {
  const falSystem =
    'You are a prompt engineer. Return ONE short English sentence suitable as an image-editing prompt for virtual try-on: person wearing the described garment, same pose and identity, realistic. No JSON, no explanation.';

  // 1) Fal LLM (FAL_KEY) — первым, без вызова OpenAI
  if (process.env.FAL_KEY) {
    try {
      const userContent = garmentJson
        ? `Garment description (JSON): ${JSON.stringify(garmentJson)}. Generate the try-on prompt.`
        : 'Generate a short virtual try-on prompt in English: person wearing a garment, same pose and identity, realistic.';
      const prompt = await callFalChat(falSystem, userContent, signal);
      return { prompt, source: 'fal_chat' };
    } catch {
      /* один сброс — сразу в следующую */
    }
  }

  // 2) Fal через OpenAI-прокси (если настроен)
  if (process.env.FAL_OPENAI_PROXY_URL && process.env.FAL_PROXY_API_KEY) {
    try {
      const userContent = garmentJson
        ? `Garment: ${JSON.stringify(garmentJson)}. Generate try-on prompt.`
        : 'Generate a short virtual try-on prompt in English.';
      const prompt = await callFalViaOpenAIProxy(
        [
          { role: 'system', content: falSystem },
          { role: 'user', content: userContent },
        ],
        signal
      );
      return { prompt, source: 'fal_proxy' };
    } catch {
      /* один сброс — сразу в следующую */
    }
  }

  return null;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> },
  res: { status: (n: number) => { json: (o: object) => void } },
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const garmentImageBase64 = body.garmentImageBase64 as string | undefined;

  if (!garmentImageBase64) {
    return res.status(400).json({ error: 'garmentImageBase64 is required' });
  }

  // Только Fal (FAL_KEY). OpenAI нигде не вызываем.
  const alt = await tryAlternativesForPrompt(garmentImageBase64, undefined, undefined);
  if (alt) {
    return res.status(200).json({ prompt: alt.prompt });
  }
  return res.status(200).json({ prompt: DEFAULT_IMAGE_PROMPT });
}
