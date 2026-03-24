/**
 * Provider Abstraction Layer (Issue #15).
 * Unified interface: generateImage(payload) / generateVideo(payload).
 * Switch by model: fal-ai/* → Fal, else → KIE. Prompt остаётся один.
 * Returns: model, duration_ms, status, credits_used (if available).
 * Centralized error mapping (timeout, 4xx, 5xx).
 */

export type GenerateImageSuccess = {
  status: 'success';
  model: string;
  duration_ms: number;
  imageUrl: string;
  credits_used?: number;
};

export type GenerateImageError = {
  status: 'error';
  model: string;
  duration_ms: number;
  httpStatus: number;
  error: string;
  credits_used?: number;
};

export type GenerateImageResult = GenerateImageSuccess | GenerateImageError;

export type GenerateImagePayload = {
  personUrl: string;
  clothingUrl: string;
  prompt?: string;
  model: string;
};

/**
 * Базовый промпт для всех провайдеров (KIE, Fal).
 * Используется как fallback когда randomizer не задействован.
 * Явно разделяет роли двух изображений и задаёт красивый фон.
 */
export const DEFAULT_IMAGE_PROMPT =
  'Virtual try-on fashion editorial. ' +
  'The person from IMAGE 1 is wearing the exact outfit shown in IMAGE 2. ' +
  'PRESERVE from IMAGE 1: exact face, skin tone, hair, body shape, and natural pose — do not alter the person. ' +
  'PRESERVE from IMAGE 2: exact garment silhouette, color, print, fabric texture, and every design detail — do not change the outfit. ' +
  'Do not use the background from either input image. ' +
  'Scene: elegant sunlit terrace with soft garden bokeh. ' +
  'Style: Vogue editorial fashion photography, premium campaign quality. ' +
  'Lighting: soft diffused natural light, subtle rim light on the subject. ' +
  'Camera: Sony A7R V, 85mm f/1.8, shallow depth of field, subject sharp. ' +
  'Composition: vertical 9:16, rule of thirds, full or 3/4 figure. ' +
  'Output: hyper-realistic, pin-sharp subject, beautiful background bokeh.';

export function getImageProvider(model: string): 'fal' | 'kie' {
  if (model.startsWith('fal-ai/')) return 'fal';
  return 'kie';
}

/** Centralized error mapping: timeout → 408, 4xx/5xx → consistent message. */
export function mapToHttpError(
  kind: 'timeout' | 'client' | 'server' | 'unknown',
  message?: string
): { httpStatus: number; error: string } {
  switch (kind) {
    case 'timeout':
      return { httpStatus: 408, error: message ?? 'Превышено время ожидания. Попробуйте ещё раз.' };
    case 'client':
      return { httpStatus: 422, error: message ?? 'Генерация не удалась. Попробуйте снова.' };
    case 'server':
      return { httpStatus: 502, error: message ?? 'Не удалось сгенерировать изображение. Попробуйте позже.' };
    default:
      return { httpStatus: 500, error: message ?? 'Сервис временно недоступен. Попробуйте позже.' };
  }
}

export { generateImage } from './generate-image-router';
