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

const _CORE = `You are doing a virtual fashion try-on.

The FIRST image is the PERSON (identity reference).
The SECOND image is the OUTFIT (clothing reference only).

Dress the person from the FIRST image in the outfit from the SECOND image.
Remove or ignore the original clothing from the person image.

Preserve the person's identity: same face, age, gender expression, hairstyle and overall build.
Preserve the outfit design from the second image: color, fabric, cut, silhouette and key details.
Adapt the outfit naturally to the person's body, pose and camera angle.

Do not stylize or redraw the face.
The final result must look like a real photo of this person wearing this outfit.

Full body visible. Natural posture. Premium fashion photography style.`;

const _SCENE_POOL = [
  'modern gym with dramatic lighting',
  'sunrise mountain trail with fresh air',
  'sunset ocean shore with golden light',
  'luxury yacht deck',
  'coastal promenade',
  'clean white gallery interior',
  'luxury minimalist penthouse',
  'high-end showroom interior',
  'modern downtown street',
  'glass skyscraper district',
  'evening city lights boulevard',
  'forest clearing with sun rays',
  'mountain valley landscape',
  'luxury fashion boutique interior',
  'rooftop terrace with city view',
  'modern architectural concrete space',
];

const _LIGHTING_POOL = [
  'golden hour sunset light',
  'soft morning diffused light',
  'bright clean studio lighting',
  'warm evening ambient light',
  'dramatic cinematic side light',
  'soft natural window light',
];

const _CAMERA_POOL = [
  'full body fashion shot, Canon EOS R5, 85mm f/1.8',
  'editorial standing pose, Sony A7R V, 85mm f/1.4',
  'wide cinematic shot, Hasselblad X2D, 80mm',
  'walking lifestyle shot, Canon EOS R5, 50mm f/1.2',
];

export function buildRandomTryOnPrompt(): string {
  const scene = _SCENE_POOL[Math.floor(Math.random() * _SCENE_POOL.length)];
  const lighting = _LIGHTING_POOL[Math.floor(Math.random() * _LIGHTING_POOL.length)];
  const camera = _CAMERA_POOL[Math.floor(Math.random() * _CAMERA_POOL.length)];
  return [
    _CORE,
    `Environment: ${scene}.`,
    `Lighting: ${lighting}.`,
    `Camera: ${camera}.`,
    'cinematic lighting, natural skin texture, premium editorial fashion photography, soft depth of field, high detail, photorealistic.',
  ].join('\n\n');
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
