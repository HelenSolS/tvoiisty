/**
 * POST /api/generate-image — примерка через KIE (один вызов createTask + polling).
 */

import type { Request, Response } from 'express';
import { generateImageTryOn } from '../kieClient.js';
import { getSetting } from '../settings.js';
import { logAiGeneration } from '../aiLogs.js';

const IMAGE_MODEL_POOL = [
  'flux-2/flex-image-to-image',
  'google/nano-banana-edit',
  'gpt-image/1.5-image-to-image',
  'qwen/image-edit',
  'grok-imagine/image-to-image',
  'ideogram/v3-edit',
] as const;

async function resolveImageModel(bodyModel: unknown): Promise<string> {
  if (typeof bodyModel === 'string' && (IMAGE_MODEL_POOL as readonly string[]).includes(bodyModel))
    return bodyModel;
  const fromSettings = await getSetting<string>('DEFAULT_IMAGE_MODEL');
  if (typeof fromSettings === 'string' && fromSettings.trim()) return fromSettings.trim();
  return process.env.KIE_IMAGE_MODEL || 'flux-2/flex-image-to-image';
}

export async function generateImageHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { personImageBase64?: string; clothingImageBase64?: string; prompt?: string; model?: string };
  const { personImageBase64, clothingImageBase64, prompt, model: bodyModel } = body;
  const model = await resolveImageModel(bodyModel);

  if (!personImageBase64 || !clothingImageBase64) {
    res.status(400).json({ error: 'Нужны personImageBase64 и clothingImageBase64' });
    return;
  }

  const start = Date.now();
  try {
    const imageUrl = await generateImageTryOn(personImageBase64, clothingImageBase64, prompt, model);
    const durationMs = Date.now() - start;
    await logAiGeneration({
      kind: 'image',
      provider: 'kie',
      model,
      durationMs,
      status: 'success',
    });
    res.status(200).json({ imageUrl });
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Ошибка генерации изображения';
    await logAiGeneration({
      kind: 'image',
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
