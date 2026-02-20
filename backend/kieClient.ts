/**
 * Клиент KIE API: createTask + опрос record-info до готовности.
 * Все запросы идут с сервера, ключ передаётся только в заголовках (из config).
 * Один вызов generateImageTryOn / generateVideoFromImage = один createTask + один цикл polling.
 */

import { kieApiKey, kieBaseUrl } from './config.js';
import type { KieRecordInfoResponse, KieTaskCreateResponse } from './types.js';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_IMAGE = 60;   // ~2 мин для картинки
const POLL_MAX_VIDEO = 80;    // ~2.5 мин для видео

const base = () => kieBaseUrl.replace(/\/$/, '') + '/api/v1';

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${kieApiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Создать задачу на примерку (jobs/createTask, модель flux2). Возвращает taskId. */
export async function createImageTask(params: {
  personImageBase64: string;
  clothingImageBase64: string;
  prompt?: string;
}): Promise<string> {
  const res = await fetch(`${base()}/jobs/createTask`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model: 'flux2',
      input: {
        prompt: params.prompt || 'Virtual try-on: show this person wearing this clothing naturally',
        image_urls: [params.personImageBase64, params.clothingImageBase64],
      },
    }),
  });
  const data = (await res.json()) as KieTaskCreateResponse;
  if (!res.ok) throw new Error((data as { message?: string }).message || 'Ошибка KIE при создании задачи');
  const taskId = data?.data?.taskId;
  if (!taskId) throw new Error('KIE не вернул taskId');
  return taskId;
}

/** Опрос результата задачи image: GET jobs/recordInfo?taskId= (state + resultJson). */
async function pollImageTask(taskId: string): Promise<string> {
  const url = `${base()}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
  for (let i = 0; i < POLL_MAX_IMAGE; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${kieApiKey}` } });
    const job = (await res.json()) as KieRecordInfoResponse;
    if (!res.ok) throw new Error((job as { message?: string }).message || 'Ошибка при получении результата');

    const state = job?.data?.state;
    if (state === 'success') {
      let imageUrl: string | undefined;
      try {
        const resultJson = job?.data?.resultJson;
        if (typeof resultJson === 'string') {
          const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
          imageUrl = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : undefined;
        }
      } catch {
        // ignore
      }
      if (imageUrl) return imageUrl;
      throw new Error('Результат без URL изображения');
    }
    if (state === 'fail') {
      throw new Error(job?.data?.failMsg || 'Генерация не удалась. Попробуйте снова.');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Превышено время ожидания. Попробуйте ещё раз.');
}

/**
 * Примерка: один createTask (flux2) + polling. Возвращает URL готового изображения.
 */
export async function generateImageTryOn(
  personImageBase64: string,
  clothingImageBase64: string,
  prompt?: string
): Promise<string> {
  const taskId = await createImageTask({ personImageBase64, clothingImageBase64, prompt });
  return pollImageTask(taskId);
}

/** Reels/Shorts: только вертикальное видео 9:16. Без переключателей и 16:9. */
const VIDEO_ASPECT_RATIO = '9:16' as const;

/** Промпт для видео по фото примерки: персонаж и одежда сохранены, киношно и динамично, подиумные движения, без жёстких теней, красивые текстуры и окружение, правило третей, гиперреализм. */
const DEFAULT_VIDEO_PROMPT =
  'Cinematic fashion film, dynamic and smooth. The person from the image moves with catwalk-like grace so the outfit is clearly visible at all times. Soft diffused lighting, no harsh shadows. Beautiful textures and a refined, fitting location. Rule of thirds, hyperrealistic cinematography, film look. One beautiful environment that suits the look—e.g. minimal atelier, sunlit terrace, or urban backdrop.';

/** Создать задачу на видео (Veo): POST veo/generate, image-to-video. Всегда 9:16. Используется созданное фото + киношная атмосфера. */
export async function createVideoTask(params: { imageUrl: string; prompt?: string }): Promise<string> {
  const payload = {
    prompt: params.prompt || DEFAULT_VIDEO_PROMPT,
    model: 'veo3',
    aspect_ratio: VIDEO_ASPECT_RATIO,
    imageUrls: [params.imageUrl],
  };
  console.log('VIDEO PAYLOAD:', JSON.stringify(payload, null, 2));

  const res = await fetch(`${base()}/veo/generate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as KieTaskCreateResponse & { data?: { taskId?: string } };
  if (!res.ok) throw new Error((data as { message?: string }).message || 'Ошибка KIE при создании видео');
  const taskId = data?.data?.taskId;
  if (!taskId) throw new Error('KIE не вернул taskId для видео');
  return taskId;
}

/** Извлечь videoUrl из ответа Veo3: data.output.video.url | data.result.videos[0].url | data.result.video_url | data.response. */
function extractVideoUrl(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const inner = d.data as Record<string, unknown> | undefined;
  const target = (inner && typeof inner === 'object' ? inner : d) as Record<string, unknown>;

  const output = target.output as Record<string, unknown> | undefined;
  if (output?.video && typeof (output.video as { url?: string }).url === 'string') {
    return (output.video as { url: string }).url;
  }
  const result = target.result as Record<string, unknown> | undefined;
  if (result?.video_url && typeof result.video_url === 'string') return result.video_url as string;
  const videos = result?.videos as Array<{ url?: string }> | undefined;
  if (Array.isArray(videos) && videos[0]?.url) return videos[0].url;
  const response = target.response as { result_urls?: string[]; video_url?: string } | undefined;
  if (Array.isArray(response?.result_urls) && response.result_urls[0]) return response.result_urls[0];
  if (response?.video_url) return response.video_url;
  return undefined;
}

/** Опрос результата видео: GET veo/record-info?taskId= (successFlag + response). */
async function pollVideoTask(taskId: string): Promise<string> {
  const url = `${base()}/veo/record-info?taskId=${encodeURIComponent(taskId)}`;
  for (let i = 0; i < POLL_MAX_VIDEO; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${kieApiKey}` } });
    const job = (await res.json()) as { data?: unknown; message?: string };
    if (!res.ok) throw new Error(job?.message || 'Ошибка при получении видео');

    const flag = (job?.data as { successFlag?: number | string })?.successFlag;
    if (flag === 1 || flag === '1') {
      const videoUrl = extractVideoUrl(job?.data);
      if (videoUrl) return videoUrl;
      throw new Error('Результат без URL видео');
    }
    if (flag === 2 || flag === 3 || flag === '2' || flag === '3') {
      throw new Error('Генерация видео не удалась. Попробуйте снова.');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Превышено время ожидания для видео. Попробуйте ещё раз.');
}

/**
 * Видео по URL картинки: один createTask (Veo) + polling. Возвращает URL видео.
 */
export async function generateVideoFromImage(imageUrl: string, prompt?: string): Promise<string> {
  const taskId = await createVideoTask({ imageUrl, prompt });
  return pollVideoTask(taskId);
}
