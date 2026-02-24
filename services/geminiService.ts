/**
 * Сервис примерки и видео. Вызывает только наш backend (/api/...).
 * Production: без model (бэкенд подставляет по умолчанию). Lab (dev): передаёт model из выпадающего списка.
 */

const API_BASE = '';

/** Пул моделей для изображений (Lab): KIE + Fal AI. */
export const IMAGE_MODEL_POOL = [
  'flux-2/flex-image-to-image',
  'google/nano-banana-edit',
  'gpt-image/1.5-image-to-image',
  'qwen/image-edit',
  'grok-imagine/image-to-image',
  'ideogram/v3-edit',
  'fal-ai/image-apps-v2/virtual-try-on',
  'fal-ai/nano-banana-pro/edit',
] as const;

/** Пул моделей для видео (Lab). Первая — Grok (озвучка → в промпте просим тишину), вторая — Kling (резерв). */
export const VIDEO_MODEL_POOL = [
  'grok-imagine/image-to-video',
  'kling/v2-1-standard',
  'veo-3-1',
  'runway/gen-3-alpha-turbo',
  'hailuo/2-3-image-to-video-standard',
  'wan/2-2-a14b-image-to-video-turbo',
] as const;

/** Описание образа для подсказки KIE (пока заглушка). */
async function describeOutfit(_imageUrl: string): Promise<string> {
  return 'outfit description';
}

/**
 * Получить промпт для примерки через POST /api/prepare-tryon-prompt (Vision + Prompt Builder, при сбое — альтернатива на бэкенде).
 * Если процесс прерван или нет промпта — бросает ошибку: примерку не отправлять.
 */
async function prepareTryonPrompt(personImageBase64: string, garmentImageBase64: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/prepare-tryon-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personImageBase64, garmentImageBase64 }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err?.error ?? 'Не удалось подготовить промпт');
  }
  const data = (await res.json()) as { prompt?: string };
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
  if (!prompt) {
    throw new Error('Промпт не получен. Попробуйте ещё раз или позже.');
  }
  return prompt;
}

/**
 * Примерка. Один вызов backend → один вызов KIE.
 * model — только для Lab; в production не передаётся.
 */
async function generateTryOn(
  personImageBase64: string,
  clothingImageBase64: string,
  prompt?: string,
  options?: { model?: string; fallbackOnError?: boolean; consent?: boolean }
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personImageBase64,
      clothingImageBase64,
      prompt: prompt || undefined,
      ...(options?.consent ? { consent: true } : {}),
      ...(options?.model ? { model: options.model } : {}),
      fallbackOnError: options?.fallbackOnError === true,
    }),
  });

  let data: { error?: string; imageUrl?: string; [k: string]: unknown };
  try {
    data = await res.json();
  } catch {
    throw new Error('Сервис вернул неверный ответ. Попробуйте позже.');
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Ошибка генерации изображения');
  }

  const imageUrl = data?.imageUrl;
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    throw new Error('Нет URL изображения в ответе');
  }
  return imageUrl.trim();
}

/**
 * Генерация видео. Один клик = один вызов backend/KIE.
 * model — только для Lab; в production не передаётся (бэкенд использует veo-3-1).
 */
async function generateVideo(
  resultImageUrl: string,
  options?: { model?: string; prompt?: string; consent?: boolean }
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl: resultImageUrl,
      ...(options?.model ? { model: options.model } : {}),
      ...(options?.prompt != null && options.prompt !== '' ? { prompt: options.prompt } : {}),
      ...(options?.consent ? { consent: true } : {}),
    }),
  });

  let data: { error?: string; videoUrl?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error('Сервис вернул неверный ответ. Попробуйте позже.');
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Ошибка генерации видео');
  }

  const videoUrl = data?.videoUrl;
  if (typeof videoUrl !== 'string') {
    throw new Error('Нет URL видео в ответе');
  }
  return videoUrl;
}

export { describeOutfit, prepareTryonPrompt, generateTryOn, generateVideo };
