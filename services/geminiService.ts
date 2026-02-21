/**
 * Сервис примерки и видео. Вызывает только наш backend (/api/...).
 * Ключи KIE на фронте не используются и не передаются.
 * Провайдер (нейросеть) выбирается в настройках и передаётся в теле запроса.
 */

const API_BASE = ''; // тот же origin: Vercel отдаёт и SPA, и /api

export type AiProviderId = 'default' | 'backup';

const PROVIDER_STORAGE_KEY = 'tvoisty_ai_provider';

export function getAiProvider(): AiProviderId {
  try {
    const v = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (v === 'backup' || v === 'default') return v;
  } catch {}
  return 'default';
}

export function setAiProvider(provider: AiProviderId): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
  } catch {}
}

/** Описание образа для подсказки KIE (пока заглушка). */
async function describeOutfit(_imageUrl: string): Promise<string> {
  return 'outfit description';
}

/**
 * Примерка: один вызов backend → один вызов KIE (createTask + poll).
 * Возвращает URL готового изображения.
 */
async function generateTryOn(
  personImageBase64: string,
  clothingImageBase64: string,
  prompt?: string,
  provider?: AiProviderId
): Promise<string> {
  const p = provider ?? getAiProvider();
  const res = await fetch(`${API_BASE}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personImageBase64,
      clothingImageBase64,
      prompt: prompt || undefined,
      provider: p,
    }),
  });

  let data: { error?: string; imageUrl?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error('Сервис вернул неверный ответ. Попробуйте позже.');
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Ошибка генерации изображения');
  }

  const imageUrl = data?.imageUrl;
  if (typeof imageUrl !== 'string') {
    throw new Error('Нет URL изображения в ответе');
  }
  return imageUrl;
}

/**
 * Генерация видео по URL результата примерки. Один клик = один вызов backend/KIE.
 * Возвращает URL готового видео.
 */
async function generateVideo(resultImageUrl: string, provider?: AiProviderId): Promise<string> {
  const p = provider ?? getAiProvider();
  const res = await fetch(`${API_BASE}/api/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: resultImageUrl, provider: p }),
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

export { describeOutfit, generateTryOn, generateVideo };
