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

/** Создать задачу на примерку: POST .../api/v1/jobs/createTask. */
export async function createImageTask(params: {
  personImageBase64: string;
  clothingImageBase64: string;
  prompt?: string;
  model?: string;
}): Promise<string> {
  const model = params.model || process.env.KIE_IMAGE_MODEL || 'flux-2/flex-image-to-image';
  const inputPayload = {
    aspect_ratio: '9:16',
    prompt: params.prompt || 'Virtual try-on: dress the person in the outfit from the second image naturally.',
    resolution: '1K',
    input_urls: [params.personImageBase64, params.clothingImageBase64],
  };
  const res = await fetch(`${base()}/jobs/createTask`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      input: inputPayload,
    }),
  });
  const data = (await res.json()) as KieTaskCreateResponse & { taskId?: string; task_id?: string };
  if (!res.ok) {
    console.error('[KIE] createTask non-OK', res.status, 'full response:', JSON.stringify(data));
    throw new Error('Сервис примерки временно недоступен.');
  }
  const taskId = data?.data?.taskId ?? data?.taskId ?? data?.task_id;
  if (!taskId) {
    console.error('[KIE] createTask OK but no taskId. Full response:', JSON.stringify(data));
    throw new Error('Сервис примерки временно недоступен.');
  }
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
 * Примерка: один createTask + polling. Модель из params.model или KIE_IMAGE_MODEL.
 */
export async function generateImageTryOn(
  personImageBase64: string,
  clothingImageBase64: string,
  prompt?: string,
  model?: string
): Promise<string> {
  const taskId = await createImageTask({ personImageBase64, clothingImageBase64, prompt, model });
  return pollImageTask(taskId);
}

const DEFAULT_VIDEO_PROMPT =
  'Cinematic fashion film, dynamic and smooth. The person from the image moves with catwalk-like grace so the outfit is clearly visible at all times. Soft diffused lighting, no harsh shadows. Beautiful textures and a refined, fitting location. Rule of thirds, hyperrealistic cinematography, film look. One beautiful environment that suits the look—e.g. minimal atelier, sunlit terrace, or urban backdrop.';

/**
 * Grok и Kling используют jobs/createTask (не veo/generate).
 * Формат input у каждой модели свой.
 */
function buildVideoInput(model: string, imageUrl: string, prompt: string): Record<string, unknown> {
  switch (model) {
    case 'kling/v2-1-standard':
      return { prompt, image_url: imageUrl, duration: '5' };
    case 'grok-imagine/image-to-video':
    default:
      return { image_urls: [imageUrl], prompt, mode: 'normal', duration: '6', resolution: '480p' };
  }
}

function extractVideoUrlFromResultJson(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const result = d.result as Record<string, unknown> | undefined;
  if (result?.video_url && typeof result.video_url === 'string') return result.video_url;
  const videos = result?.videos as Array<{ url?: string }> | undefined;
  if (Array.isArray(videos) && videos[0]?.url) return videos[0].url;
  const response = d.response as Record<string, unknown> | undefined;
  if (response) {
    const rUrls = (response.result_urls ?? response.resultUrls) as string[] | undefined;
    if (Array.isArray(rUrls) && rUrls[0]) return rUrls[0];
    if (typeof response.video_url === 'string') return response.video_url;
  }
  const resultUrls = (d.result_urls ?? d.resultUrls) as string[] | undefined;
  if (Array.isArray(resultUrls) && resultUrls[0]) return resultUrls[0];
  return undefined;
}

/** Создать задачу видео через jobs/createTask (Grok / Kling). */
async function createVideoTask(params: { imageUrl: string; prompt?: string; model: string }): Promise<string> {
  const prompt = params.prompt || DEFAULT_VIDEO_PROMPT;
  const input = buildVideoInput(params.model, params.imageUrl, prompt);
  console.log('[KIE VIDEO] createTask model:', params.model);
  const res = await fetch(`${base()}/jobs/createTask`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model: params.model, input }),
  });
  const data = (await res.json()) as { data?: { taskId?: string }; message?: string; code?: number };
  if (!res.ok) throw new Error(data?.message || 'Ошибка KIE при создании видео');
  const taskId = data?.data?.taskId;
  if (!taskId) throw new Error('KIE не вернул taskId для видео');
  return taskId;
}

/** Опрос jobs/recordInfo (state: success/fail, resultJson с URL). */
async function pollVideoTask(taskId: string): Promise<string> {
  const url = `${base()}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
  for (let i = 0; i < POLL_MAX_VIDEO; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${kieApiKey}` } });
    const job = (await res.json()) as { data?: { state?: string; resultJson?: string; failMsg?: string }; message?: string };
    if (!res.ok) throw new Error(job?.message || 'Ошибка при получении видео');
    const state = job?.data?.state;
    if (state === 'success') {
      const resultJson = job?.data?.resultJson;
      if (typeof resultJson === 'string') {
        try {
          const parsed = JSON.parse(resultJson) as Record<string, unknown>;
          const videoUrl = extractVideoUrlFromResultJson(parsed);
          if (videoUrl) return videoUrl;
          const urls = (parsed?.result_urls ?? parsed?.resultUrls) as string[] | undefined;
          if (Array.isArray(urls) && urls[0]) return urls[0];
        } catch { /* ignore */ }
      }
      throw new Error('Результат без URL видео');
    }
    if (state === 'fail') {
      throw new Error(job?.data?.failMsg || 'Генерация видео не удалась. Попробуйте снова.');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Превышено время ожидания для видео. Попробуйте ещё раз.');
}

const VIDEO_MODELS = ['grok-imagine/image-to-video', 'kling/v2-1-standard'] as const;

/**
 * Видео по URL картинки: Grok первым, при ошибке — Kling.
 * model-параметр позволяет задать конкретную модель (например, в animateLite).
 */
export async function generateVideoFromImage(imageUrl: string, prompt?: string, model?: string): Promise<string> {
  const models = model ? [model] : [...VIDEO_MODELS];
  let lastError: Error = new Error('video-generation-failed');
  for (const m of models) {
    try {
      const taskId = await createVideoTask({ imageUrl, prompt, model: m });
      return await pollVideoTask(taskId);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[KIE video] ${m} failed:`, lastError.message);
    }
  }
  throw lastError;
}
