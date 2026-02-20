/**
 * POST /api/generate-image — примерка через KIE (один вызов createTask + polling).
 */

import type { Request, Response } from 'express';
import { generateImageTryOn } from '../kieClient.js';

export async function generateImageHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { personImageBase64?: string; clothingImageBase64?: string; prompt?: string };
  const { personImageBase64, clothingImageBase64, prompt } = body;

  if (!personImageBase64 || !clothingImageBase64) {
    res.status(400).json({ error: 'Нужны personImageBase64 и clothingImageBase64' });
    return;
  }

  try {
    const imageUrl = await generateImageTryOn(personImageBase64, clothingImageBase64, prompt);
    res.status(200).json({ imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка генерации изображения';
    if (message.includes('время ожидания')) {
      res.status(408).json({ error: message });
    } else if (message.includes('не удалась') || message.includes('Генерация')) {
      res.status(422).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
}
