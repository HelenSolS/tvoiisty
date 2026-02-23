/**
 * Router: по model выбирает Fal или KIE. При ошибке KIE — повтор в Fal (fallback).
 */

import type { GenerateImagePayload, GenerateImageResult } from './provider-abstraction';
import { getImageProvider } from './provider-abstraction';
import { runFalTryOn } from './providers/fal-image';
import { runKieTryOn } from './providers/kie-image';

/** Модель Fal для fallback, когда KIE ответил ошибкой. */
const FAL_FALLBACK_MODEL = 'fal-ai/image-apps-v2/virtual-try-on';

export type GenerateImageOptions = {
  /** Если false — при ошибке KIE не вызывать Fal, вернуть ошибку сразу. Задаётся из панели настроек. */
  fallbackOnError?: boolean;
};

export async function generateImage(
  payload: GenerateImagePayload,
  options?: GenerateImageOptions
): Promise<GenerateImageResult> {
  const startTs = Date.now();
  const provider = getImageProvider(payload.model);
  const fallbackOnError = options?.fallbackOnError === true;

  if (provider === 'fal') {
    return runFalTryOn(payload, startTs);
  }

  const kieResult = await runKieTryOn(payload, startTs, {
    KIE_BASE_URL: process.env.KIE_BASE_URL,
    KIE_API_KEY: process.env.KIE_API_KEY,
  });

  if (kieResult.status === 'success' && typeof kieResult.imageUrl === 'string' && kieResult.imageUrl.trim()) {
    return kieResult;
  }

  if (!fallbackOnError || !process.env.FAL_KEY) {
    return kieResult;
  }

  console.error('[generate-image-router] KIE returned error, fallback to Fal', { requestedModel: payload.model });
  const falPayload: GenerateImagePayload = {
    ...payload,
    model: FAL_FALLBACK_MODEL,
  };
  const falResult = await runFalTryOn(falPayload, startTs);
  if (falResult.status === 'success') {
    return falResult;
  }
  return falResult;
}
