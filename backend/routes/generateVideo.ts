/**
 * POST /api/generate-video — генерация видео по URL результата примерки.
 * body.model передаётся в kieClient (для Veo — подставляется в запрос; Runway/Kling и др. — только в api/generate-video на Vercel).
 */

import type { Request, Response } from 'express';
import { generateVideoFromImage } from '../kieClient.js';

const VIDEO_MODEL_POOL = [
  'kling/v2-1-standard',
  'veo-3-1',
  'runway/gen-3-alpha-turbo',
  'hailuo/2-3-image-to-video-standard',
  'wan/2-2-a14b-image-to-video-turbo',
  'grok-imagine/image-to-video',
] as const;

function resolveVideoModel(bodyModel: unknown): string {
  if (typeof bodyModel === 'string' && (VIDEO_MODEL_POOL as readonly string[]).includes(bodyModel))
    return bodyModel;
  return process.env.KIE_VIDEO_MODEL || 'veo-3-1';
}

export async function generateVideoHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { imageUrl?: string; prompt?: string; model?: string };
  const { imageUrl, model: bodyModel } = body;
  const model = resolveVideoModel(bodyModel);

  if (!imageUrl || typeof imageUrl !== 'string') {
    res.status(400).json({ error: 'Нужен imageUrl (результат примерки)' });
    return;
  }

  try {
    const videoUrl = await generateVideoFromImage(imageUrl, body.prompt, model);
    res.status(200).json({ videoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка генерации видео';
    if (message.includes('время ожидания')) {
      res.status(408).json({ error: message });
    } else if (message.includes('не удалась') || message.includes('Генерация')) {
      res.status(422).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
}
