/**
 * POST /api/prepare-tryon-prompt — Issue #12.
 * Vision (gpt-4o) → JSON → Prompt Builder (gpt-4o-mini) → { prompt, garmentJson? }.
 * Robustness: Vision timeout 15s, retry once on invalid JSON, validate schema, log malformed, fallback to DEFAULT_IMAGE_PROMPT.
 */

import { tryParseGarmentDescription } from '../lib/ai/garment-schema';
import {
  GARMENT_VISION_SYSTEM_PROMPT,
  TRYON_PROMPT_BUILDER_SYSTEM_PROMPT,
  buildTryOnPromptUserMessage,
} from '../lib/ai/prompts';

/** Same as api/generate-image.ts — fallback when Vision or Prompt Builder fails. */
const DEFAULT_IMAGE_PROMPT =
  'Person from uploaded photos wearing new outfit. Preserve full identity and body proportions, natural confident fashion pose. Setting: neutral premium minimalist interior. Background: soft beige-gray or light concrete, clean and distraction-free. Style: hyper-realistic high-end fashion photography. Lighting: soft directional side light with subtle rim light. Mood: premium, confident, modern. Composition: rule of thirds, subject centered, vertical frame. Camera: Sony A7R V, 85mm f/1.8. Format: vertical.';

const VISION_TIMEOUT_MS = 15_000;
const OPENAI_BASE = 'https://api.openai.com/v1';

function toDataUrl(base64: string, mime = 'image/jpeg'): string {
  if (base64.startsWith('data:')) return base64;
  return `data:${mime};base64,${base64}`;
}

async function callVision(garmentImageBase64: string, signal: AbortSignal | undefined): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const url = `${OPENAI_BASE}/chat/completions`;
  const body = {
    model: 'gpt-4o',
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
        return res.status(200).json({ prompt: DEFAULT_IMAGE_PROMPT });
      }
    } catch (retryErr) {
      console.error('[prepare-tryon-prompt] Vision retry failed', retryErr);
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
    console.error('[prepare-tryon-prompt] Prompt Builder failed', err);
    return res.status(200).json({ prompt: DEFAULT_IMAGE_PROMPT, garmentJson });
  }

  return res.status(200).json({ prompt, garmentJson });
}
