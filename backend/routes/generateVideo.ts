/**
 * POST /api/generate-video — генерация видео по URL результата примерки.
 * body.model передаётся в kieClient (для Veo — подставляется в запрос; Runway/Kling и др. — только в api/generate-video на Vercel).
 */

import type { Request, Response } from 'express';
import { generateVideoFromImage } from '../kieClient.js';
import { getSetting } from '../settings.js';
import { logAiGeneration } from '../aiLogs.js';

const VIDEO_MODEL_POOL = [
  'grok-imagine/image-to-video',
  'kling/v2-1-standard',
  'veo-3-1',
  'runway/gen-3-alpha-turbo',
  'hailuo/2-3-image-to-video-standard',
  'wan/2-2-a14b-image-to-video-turbo',
] as const;

async function resolveVideoModel(bodyModel: unknown): Promise<string> {
  if (typeof bodyModel === 'string' && (VIDEO_MODEL_POOL as readonly string[]).includes(bodyModel))
    return bodyModel;
  const fromSettings = await getSetting<string>('DEFAULT_VIDEO_MODEL');
  if (typeof fromSettings === 'string' && fromSettings.trim()) return fromSettings.trim();
  return process.env.KIE_VIDEO_MODEL || 'grok-imagine/image-to-video';
}

export async function generateVideoHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { imageUrl?: string; prompt?: string; model?: string };
  const { imageUrl, model: bodyModel } = body;
  const model = await resolveVideoModel(bodyModel);

  if (!imageUrl || typeof imageUrl !== 'string') {
    res.status(400).json({ error: 'Нужен imageUrl (результат примерки)' });
    return;
  }

  const start = Date.now();
  try {
    const videoUrl = await generateVideoFromImage(imageUrl, body.prompt, model);
    const durationMs = Date.now() - start;
    await logAiGeneration({
      kind: 'video',
      provider: 'kie',
      model,
      durationMs,
      status: 'success',
    });
    res.status(200).json({ videoUrl });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Ошибка генерации видео';
    await logAiGeneration({
      kind: 'video',
      provider: 'kie',
      model,
      durationMs,
      status: 'error',
      errorMessage: message,
    });
    if (message.includes('время ожидания')) {
      res.status(408).json({ error: message });
    } else if (message.includes('не удалась') || message.includes('Генерация')) {
      res.status(422).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
}
