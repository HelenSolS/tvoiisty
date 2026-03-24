/**
 * Provider Abstraction Layer (Issue #15). Копия под api/ для деплоя на Vercel.
 * Unified interface: generateImage(payload) / generateVideo(payload).
 * Switch by model: fal-ai/* → Fal, else → KIE.
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

const LOCATIONS = [
  'clean white editorial studio, professional softbox lighting',
  'modern rooftop terrace, open sky, crisp natural daylight',
  'Mediterranean waterfront, calm sea in background, soft overcast light',
  'sleek contemporary office lobby, glass and steel, cool natural light',
  'fashion showroom interior, white walls, soft window light',
  'outdoor urban plaza, modern architecture backdrop, even daylight',
  'coastal cliff path, sea panorama, soft diffused light',
  'minimal luxury apartment, large panoramic windows, neutral tones',
];

const ATMOSPHERES = [
  'Vogue fashion editorial',
  "Harper's Bazaar campaign",
  'high-end fashion lookbook',
  'luxury brand campaign',
  'contemporary fashion magazine spread',
];

const CAMERAS = [
  'Canon EOS R5, 85mm f/1.8, tack sharp, soft background separation',
  'Sony A7R V, 85mm f/1.4 G Master, professional editorial framing',
  'Hasselblad X2D, 80mm, crisp fashion editorial quality',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function buildRandomTryOnPrompt(): string {
  const location = pickRandom(LOCATIONS);
  const atmosphere = pickRandom(ATMOSPHERES);
  const camera = pickRandom(CAMERAS);
  return (
    'Virtual try-on. ' +
    'Person from IMAGE 1 wearing the outfit from IMAGE 2. ' +
    'Preserve face, skin tone, hair, body shape exactly from IMAGE 1. ' +
    'Preserve garment color, cut, print, fabric texture exactly from IMAGE 2. ' +
    `Background: ${location}. ` +
    `${atmosphere}. ` +
    `${camera}. Vertical 9:16. Hyper-realistic, sharp subject.`
  );
}

export const DEFAULT_IMAGE_PROMPT = buildRandomTryOnPrompt();

export function getImageProvider(model: string): 'fal' | 'kie' {
  if (model.startsWith('fal-ai/')) return 'fal';
  return 'kie';
}

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

export { generateImage } from './generate-image-router.js';
