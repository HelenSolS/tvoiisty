/**
 * POST /api/generate-image — примерка через KIE (один вызов createTask + polling).
 */

import type { Request, Response } from 'express';
import { generateImageTryOn } from '../kieClient.js';

const IMAGE_MODEL_POOL = [
  'flux-2/flex-image-to-image',
  'google/nano-banana-edit',
  'gpt-image/1.5-image-to-image',
  'qwen/image-edit',
  'grok-imagine/image-to-image',
  'ideogram/v3-edit',
] as const;

function resolveImageModel(bodyModel: unknown): string {
  if (typeof bodyModel === 'string' && (IMAGE_MODEL_POOL as readonly string[]).includes(bodyModel))
    return bodyModel;
  return process.env.KIE_IMAGE_MODEL || 'flux-2/flex-image-to-image';
}

export async function generateImageHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { personImageBase64?: string; clothingImageBase64?: string; prompt?: string; model?: string };
  const { personImageBase64, clothingImageBase64, prompt, model: bodyModel } = body;
  const model = resolveImageModel(bodyModel);

  if (!personImageBase64 || !clothingImageBase64) {
    res.status(400).json({ error: 'Нужны personImageBase64 и clothingImageBase64' });
    return;
  }

  try {
    const imageUrl = await generateImageTryOn(personImageBase64, clothingImageBase64, prompt, model);
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
