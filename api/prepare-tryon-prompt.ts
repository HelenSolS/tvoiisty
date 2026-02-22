/**
 * POST /api/prepare-tryon-prompt — Issue #12.
 * Vision → JSON → Prompt Builder → { prompt, garmentJson? }.
 * При сбое — цепочка альтернатив: один сброс, сразу в следующую — OpenAI simple → Fal LLM (FAL_KEY) → Fal OpenAI-прокси (если задан). Уведомление админа при fallback/токенах.
 */

import { tryParseGarmentDescription } from '../lib/ai/garment-schema.js';
import {
  GARMENT_VISION_SYSTEM_PROMPT,
  TRYON_PROMPT_BUILDER_SYSTEM_PROMPT,
  buildTryOnPromptUserMessage,
} from '../lib/ai/prompts.js';

/** Same as api/generate-image.ts — fallback when Vision or Prompt Builder fails. Явно: вещь со второго изображения на человека с первого. */
const DEFAULT_IMAGE_PROMPT =
  'Dress the person from the first image in the garment from the second image. Replace only the clothing; keep face, body, pose and identity unchanged. Person wearing the new outfit. Preserve full identity and body proportions, natural confident fashion pose. Setting: neutral premium minimalist interior. Background: soft beige-gray or light concrete, clean and distraction-free. Style: hyper-realistic high-end fashion photography. Lighting: soft directional side light with subtle rim light. Mood: premium, confident, modern. Composition: rule of thirds, subject centered, vertical frame. Camera: Sony A7R V, 85mm f/1.8. Format: vertical.';

const VISION_TIMEOUT_MS = 15_000;
const OPENAI_BASE = 'https://api.openai.com/v1';
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

/** Альтернатива: один вызов OpenAI (gpt-4o-mini + картинка) — короткий промпт для примерки. Меньше токенов, подходит при сбое основного пути или лимитах. */
async function callOpenAISimplePrompt(garmentImageBase64: string, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const url = `${OPENAI_BASE}/chat/completions`;
  const body = {
    model: 'gpt-4o-mini',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Look at this garment image. Reply with a single short sentence in English suitable as an image-editing prompt for virtual try-on: person wearing this garment, same pose and identity, realistic. No JSON, no explanation.',
          },
          { type: 'image_url', image_url: { url: toDataUrl(garmentImageBase64) } },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 401 || res.status === 429) {
    notifyAdmin('openai_quota_or_auth', { status: res.status, endpoint: 'prepare-tryon-prompt-fallback' });
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI simple ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const prompt = data.choices?.[0]?.message?.content?.trim();
  if (!prompt) throw new Error('OpenAI simple returned empty content');
  return prompt;
}

/** Fal LLM (Mixtral и т.п.): текстовый чат по FAL_KEY. Один сброс — сразу в следующую. */
async function callFalChat(systemPrompt: string, userContent: string, signal?: AbortSignal): Promise<string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error('FAL_KEY not set');

  const url = `https://queue.fal.run/${FAL_CHAT_MODEL}`;
  // Fal queue REST ожидает поля в корне тела (как для FASHN/nano-banana), без обёртки "input"
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

/** Цепочка альтернатив: один сброс — сразу в следующую. Порядок: OpenAI simple → Fal chat → Fal proxy (если задан). */
async function tryAlternativesForPrompt(
  garmentImageBase64: string,
  garmentJson?: Record<string, string>,
  signal?: AbortSignal
): Promise<{ prompt: string; source: string } | null> {
  const falSystem =
    'You are a prompt engineer. Return ONE short English sentence suitable as an image-editing prompt for virtual try-on: person wearing the described garment, same pose and identity, realistic. No JSON, no explanation.';

  // 1) OpenAI simple (image → prompt)
  if (process.env.OPENAI_API_KEY) {
    try {
      const prompt = await callOpenAISimplePrompt(garmentImageBase64, signal);
      return { prompt, source: 'openai_simple' };
    } catch {
      /* один сброс — сразу в следующую */
    }
  }

  // 2) Fal LLM (текст: JSON или общее описание)
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

  // 3) Fal через OpenAI-прокси (если настроен)
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

function toDataUrl(base64: string, mime = 'image/jpeg'): string {
  if (base64.startsWith('data:')) return base64;
  return `data:${mime};base64,${base64}`;
}

async function callVision(garmentImageBase64: string, signal: AbortSignal | undefined): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const url = `${OPENAI_BASE}/chat/completions`;
  const visionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  const body = {
    model: visionModel,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: GARMENT_VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: toDataUrl(garmentImageBase64) },
          },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Vision API ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Vision returned empty content');

  try {
    const raw = JSON.parse(content) as unknown;
    return raw;
  } catch {
    return content as unknown;
  }
}

async function callPromptBuilder(garmentJson: Record<string, string>, signal: AbortSignal): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const url = `${OPENAI_BASE}/chat/completions`;
  const body = {
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      { role: 'system', content: TRYON_PROMPT_BUILDER_SYSTEM_PROMPT },
      { role: 'user', content: buildTryOnPromptUserMessage(garmentJson) },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Prompt Builder API ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const prompt = data.choices?.[0]?.message?.content?.trim();
  if (!prompt) throw new Error('Prompt Builder returned empty content');
  return prompt;
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

  if (!process.env.OPENAI_API_KEY) {
    console.error('[prepare-tryon-prompt] OPENAI_API_KEY not set');
    notifyAdmin('openai_key_missing', { endpoint: 'prepare-tryon-prompt' });
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }

  const runVisionWithTimeout = async (): Promise<unknown> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
    try {
      return await callVision(garmentImageBase64, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let raw: unknown;
  try {
    raw = await runVisionWithTimeout();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[prepare-tryon-prompt] Vision failed', msg);
    if (String(msg).includes('401') || String(msg).includes('429')) {
      notifyAdmin('openai_quota_or_auth', { stage: 'vision', message: msg });
    }
    const alt = await tryAlternativesForPrompt(garmentImageBase64, undefined, undefined);
    if (alt) {
      notifyAdmin('fallback_used', { stage: 'after_vision_fail', source: alt.source });
      return res.status(200).json({ prompt: alt.prompt });
    }
    notifyAdmin('fallback_failed', { stage: 'after_vision_fail' });
    return res.status(200).json({ prompt: DEFAULT_IMAGE_PROMPT });
  }

  let garment = tryParseGarmentDescription(raw);
  if (!garment) {
    console.error('[prepare-tryon-prompt] malformed Vision JSON', raw);
    try {
      raw = await runVisionWithTimeout();
      garment = tryParseGarmentDescription(raw);
      if (!garment) {
        console.error('[prepare-tryon-prompt] malformed Vision JSON on retry', raw);
        const alt = await tryAlternativesForPrompt(garmentImageBase64, undefined, undefined);
        if (alt) {
          notifyAdmin('fallback_used', { stage: 'malformed_json', source: alt.source });
          return res.status(200).json({ prompt: alt.prompt });
        }
        notifyAdmin('fallback_failed', { stage: 'malformed_json' });
        return res.status(200).json({ prompt: DEFAULT_IMAGE_PROMPT });
      }
    } catch (retryErr) {
      console.error('[prepare-tryon-prompt] Vision retry failed', retryErr);
      const alt = await tryAlternativesForPrompt(garmentImageBase64, undefined, undefined);
      if (alt) {
        notifyAdmin('fallback_used', { stage: 'vision_retry_fail', source: alt.source });
        return res.status(200).json({ prompt: alt.prompt });
      }
      notifyAdmin('fallback_failed', { stage: 'vision_retry_fail' });
      return res.status(200).json({ prompt: DEFAULT_IMAGE_PROMPT });
    }
  }

  const garmentJson = garment as Record<string, string>;

  let prompt: string;
  try {
    const builderController = new AbortController();
    const builderTimeoutId = setTimeout(() => builderController.abort(), 15_000);
    prompt = await callPromptBuilder(garmentJson, builderController.signal);
    clearTimeout(builderTimeoutId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[prepare-tryon-prompt] Prompt Builder failed', err);
    if (String(msg).includes('401') || String(msg).includes('429')) {
      notifyAdmin('openai_quota_or_auth', { stage: 'prompt_builder', message: msg });
    }
    const alt = await tryAlternativesForPrompt(garmentImageBase64, garmentJson, undefined);
    if (alt) {
      notifyAdmin('fallback_used', { stage: 'after_builder_fail', source: alt.source });
      return res.status(200).json({ prompt: alt.prompt, garmentJson });
    }
    notifyAdmin('fallback_failed', { stage: 'after_builder_fail' });
    return res.status(200).json({ prompt: DEFAULT_IMAGE_PROMPT, garmentJson });
  }

  return res.status(200).json({ prompt, garmentJson });
}
