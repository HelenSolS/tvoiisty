import type { Request, Response } from 'express';
import { generateVideoFromImage } from '../kieClient.js';

const PRIMARY_LITE = 'grok-imagine/image-to-video';
const FALLBACK_LITE = 'kling/v2-1-standard';

/**
 * Лайтовая анимация: POST /api/animate-lite
 * Вход: { imageUrl, model? }
 * Правило: сначала Grok, при ошибке — Kling. Без сессий и истории.
 */
export async function animateLiteHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { imageUrl?: string; prompt?: string };
  const { imageUrl } = body;

  if (!imageUrl || typeof imageUrl !== 'string') {
    res.status(400).json({ error: 'Нужен imageUrl' });
    return;
  }

  const prompt = body.prompt ?? undefined;

  try {
    let videoUrl: string;
    let modelUsed: string = PRIMARY_LITE;
    try {
      videoUrl = await generateVideoFromImage(imageUrl, prompt, modelUsed);
    } catch (firstErr) {
      modelUsed = FALLBACK_LITE;
      videoUrl = await generateVideoFromImage(imageUrl, prompt, modelUsed);
    }
    res.status(200).json({
      videoUrl,
      modelUsed,
      fallbackUsed: modelUsed === FALLBACK_LITE,
    });
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

