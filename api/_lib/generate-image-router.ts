/**
 * Router: по model выбирает Fal или KIE.
 * KIE ошибка → fallback на Fal. Fal явная ошибка (FAILED/502) → fallback на KIE. При таймауте Fal НЕ дублируем в KIE — ждём ответ, при 200 забираем картинку.
 */

import type { GenerateImagePayload, GenerateImageResult } from './provider-abstraction.js';
import { getImageProvider } from './provider-abstraction.js';
import { runFalTryOn } from './providers/fal-image.js';
import { runKieTryOn } from './providers/kie-image.js';

const FAL_FALLBACK_MODEL = 'fal-ai/image-apps-v2/virtual-try-on';
/** Только при явной ошибке Fal (не таймаут) — пробуем KIE. При 408 таймаут не вызываем KIE (нет дублирования, кто платит за вторую картинку). */
const KIE_FALLBACK_MODEL = 'flux-2/flex-image-to-image';

export type GenerateImageOptions = {
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
    const falResult = await runFalTryOn(payload, startTs);
    if (falResult.status === 'success' && typeof falResult.imageUrl === 'string' && falResult.imageUrl.trim()) {
      return falResult;
    }
    const isFalTimeout = 'httpStatus' in falResult && falResult.httpStatus === 408;
    if (fallbackOnError && process.env.KIE_API_KEY && !isFalTimeout) {
      console.error('[generate-image-router] Fal error (not timeout), fallback to KIE', { requestedModel: payload.model, ...('httpStatus' in falResult ? { httpStatus: falResult.httpStatus } : {}) });
      const kiePayload: GenerateImagePayload = { ...payload, model: KIE_FALLBACK_MODEL };
      const kieResult = await runKieTryOn(kiePayload, startTs, {
        KIE_BASE_URL: process.env.KIE_BASE_URL,
        KIE_API_KEY: process.env.KIE_API_KEY,
      });
      if (kieResult.status === 'success' && typeof kieResult.imageUrl === 'string' && kieResult.imageUrl.trim()) {
        return kieResult;
      }
    }
    return falResult;
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
