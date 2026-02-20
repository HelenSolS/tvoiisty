/**
 * POST /api/generate-video — генерация видео по URL результата примерки (один вызов Veo + polling).
 */

import type { Request, Response } from 'express';
import { generateVideoFromImage } from '../kieClient.js';

export async function generateVideoHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { imageUrl?: string; prompt?: string };
  const { imageUrl } = body;

  if (!imageUrl || typeof imageUrl !== 'string') {
    res.status(400).json({ error: 'Нужен imageUrl (результат примерки)' });
    return;
  }

  try {
    const videoUrl = await generateVideoFromImage(imageUrl, body.prompt);
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
