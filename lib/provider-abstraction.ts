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

const _LOCATIONS = [
  'clean white editorial studio, professional softbox lighting',
  'modern rooftop terrace, open sky, crisp natural daylight',
  'Mediterranean waterfront, calm sea in background, soft overcast light',
  'sleek contemporary office lobby, glass and steel, cool natural light',
  'fashion showroom interior, white walls, soft window light',
  'outdoor urban plaza, modern architecture backdrop, even daylight',
  'coastal cliff path, sea panorama, soft diffused light',
  'minimal luxury apartment, large panoramic windows, neutral tones',
];
const _ATMOSPHERES = [
  'Vogue fashion editorial',
  "Harper's Bazaar campaign",
  'high-end fashion lookbook',
  'luxury brand campaign',
  'contemporary fashion magazine spread',
];
const _CAMERAS = [
  'Canon EOS R5, 85mm f/1.8, tack sharp, soft background separation',
  'Sony A7R V, 85mm f/1.4 G Master, professional editorial framing',
  'Hasselblad X2D, 80mm, crisp fashion editorial quality',
];

export function buildRandomTryOnPrompt(): string {
  const loc = _LOCATIONS[Math.floor(Math.random() * _LOCATIONS.length)];
  const atm = _ATMOSPHERES[Math.floor(Math.random() * _ATMOSPHERES.length)];
  const cam = _CAMERAS[Math.floor(Math.random() * _CAMERAS.length)];
  return (
    'Virtual try-on. ' +
    'Person from IMAGE 1 wearing the outfit from IMAGE 2. ' +
    'Preserve face, skin tone, hair, body shape exactly from IMAGE 1. ' +
    'Preserve garment color, cut, print, fabric texture exactly from IMAGE 2. ' +
    `Background: ${loc}. ` +
    `${atm}. ` +
    `${cam}. Vertical 9:16. Hyper-realistic, sharp subject.`
  );
}

export const DEFAULT_IMAGE_PROMPT = buildRandomTryOnPrompt();

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
