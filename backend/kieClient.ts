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

/** Reels/Shorts: только вертикальное видео 9:16. Без переключателей и 16:9. */
const VIDEO_ASPECT_RATIO = '9:16' as const;
const VIDEO_MODEL_GROK = 'grok-imagine/image-to-video';
const VIDEO_MODEL_KLING = 'kling/v2-1-standard';
const VIDEO_MODEL_VEO = 'veo-3-1';

/** Базовый промпт для видео по фото примерки: сохраняем персонажа и одежду, киношный вертикальный fashion-ролик. */
const DEFAULT_VIDEO_PROMPT =
  'Use the same person and the same outfit from the image. ' +
  'Preserve the face exactly. Preserve the outfit exactly: color, design, fabric and fit. Do not modify the clothing or the person. ' +
  'Cinematic fashion film. Smooth natural movement so the outfit remains clearly visible. ' +
  'The person moves with relaxed catwalk-like confidence. ' +
  'Soft diffused lighting, no harsh shadows. Hyperrealistic cinematography, film look. ' +
  'Rule of thirds composition. Shallow depth of field. ' +
  'Beautiful location that complements the outfit, such as a minimal atelier, sunlit terrace, modern architecture space, or elegant urban backdrop. ' +
  'Subtle cinematic camera movement, gentle motion, no fast actions.';

function normalizeVideoModel(model?: string): string {
  const value = (model || '').trim();
  if (value === VIDEO_MODEL_GROK || value === VIDEO_MODEL_KLING || value === VIDEO_MODEL_VEO) return value;
  const fromEnv = (process.env.KIE_VIDEO_MODEL || '').trim();
  if (fromEnv === VIDEO_MODEL_GROK || fromEnv === VIDEO_MODEL_KLING || fromEnv === VIDEO_MODEL_VEO) {
    return fromEnv;
  }
  return VIDEO_MODEL_GROK;
}

type VideoTaskKind = 'jobs' | 'veo';

/** Создать задачу на видео. Для Grok/Kling — jobs/createTask, для Veo — veo/generate. */
export async function createVideoTask(params: {
  imageUrl: string;
  prompt?: string;
  model?: string;
}): Promise<{ taskId: string; kind: VideoTaskKind; model: string }> {
  const model = normalizeVideoModel(params.model);

  if (model === VIDEO_MODEL_GROK || model === VIDEO_MODEL_KLING) {
    const input =
      model === VIDEO_MODEL_GROK
        ? {
            image_urls: [params.imageUrl],
            prompt: params.prompt || DEFAULT_VIDEO_PROMPT,
            mode: 'normal',
            duration: '6',
            resolution: '480p',
          }
        : {
            prompt: params.prompt || DEFAULT_VIDEO_PROMPT,
            image_url: params.imageUrl,
            duration: '5',
          };

    const res = await fetch(`${base()}/jobs/createTask`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model, input }),
    });
    const data = (await res.json()) as KieTaskCreateResponse & { data?: { taskId?: string } };
    if (!res.ok) throw new Error((data as { message?: string }).message || 'Ошибка KIE при создании видео');
    const taskId = data?.data?.taskId;
    if (!taskId) throw new Error('KIE не вернул taskId для видео');
    return { taskId, kind: 'jobs', model };
  }

  const payload = {
    prompt: params.prompt || DEFAULT_VIDEO_PROMPT,
    imageUrls: [params.imageUrl],
    model: 'veo3_fast',
    aspect_ratio: VIDEO_ASPECT_RATIO,
    generationType: 'FIRST_AND_LAST_FRAMES_2_VIDEO',
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
  return { taskId, kind: 'veo', model };
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

async function pollJobsVideoTask(taskId: string): Promise<string> {
  const url = `${base()}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
  for (let i = 0; i < POLL_MAX_VIDEO; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${kieApiKey}` } });
    const job = (await res.json()) as {
      data?: { state?: string; resultJson?: string; failMsg?: string };
      message?: string;
    };
    if (!res.ok) throw new Error(job?.message || 'Ошибка при получении видео');

    const state = job?.data?.state;
    if (state === 'success') {
      const resultJson = job?.data?.resultJson;
      if (typeof resultJson === 'string') {
        try {
          const parsed = JSON.parse(resultJson) as Record<string, unknown>;
          const videoUrl = extractVideoUrl(parsed);
          if (videoUrl) return videoUrl;
          if (Array.isArray(parsed?.result_urls) && parsed.result_urls[0]) return String(parsed.result_urls[0]);
          if (Array.isArray(parsed?.resultUrls) && parsed.resultUrls[0]) return String(parsed.resultUrls[0]);
        } catch {
          // ignore parse errors, continue polling
        }
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

/**
 * Видео по URL картинки: один createTask (Veo) + polling. model передаётся в createVideoTask (для Veo подставляется в запрос).
 */
export async function generateVideoFromImage(imageUrl: string, prompt?: string, model?: string): Promise<string> {
  const task = await createVideoTask({ imageUrl, prompt, model });
  if (task.kind === 'jobs') return pollJobsVideoTask(task.taskId);
  return pollVideoTask(task.taskId);
}
