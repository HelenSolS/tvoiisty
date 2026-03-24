/**
 * Минимальный клиент Fal для примерки на бэкенде.
 * Принимает URL фото человека и одежды, возвращает URL результата.
 * Канон: по умолчанию fal-ai/nano-banana-pro/edit c тем же input-форматом,
 * что и в общем Fal-провайдере (prompt + image_urls).
 */

import { buildRandomTryOnPrompt } from '../lib/provider-abstraction.js';

const FAL_MODEL_DEFAULT = 'fal-ai/nano-banana-pro/edit';
const FAL_POLL_TIMEOUT_MS = 70_000;
const FAL_POLL_INTERVAL_MS = 1500;

type FalPayload = {
  status?: 'IN_QUEUE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  status_url?: string;
  response_url?: string;
  images?: Array<{ url?: string }>;
  data?: { images?: Array<{ url?: string }> };
};

function firstImageUrl(d: FalPayload): string | undefined {
  return d?.images?.[0]?.url ?? d?.data?.images?.[0]?.url;
}

export async function tryOnWithFal(
  personImageUrl: string,
  clothingImageUrl: string,
  model: string = FAL_MODEL_DEFAULT,
  prompt?: string,
): Promise<string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) {
    throw new Error('FAL_KEY не задан. Задайте в .env для fallback-примерки.');
  }

  const m = (typeof model === 'string' ? model : '').toLowerCase();
  const effectiveModel =
    m.includes('virtual-try-on') || m.includes('image-apps-v2') ? FAL_MODEL_DEFAULT : (model || FAL_MODEL_DEFAULT);

  // Для nano-banana используем тот же формат, что и в lib/providers/fal-image:
  // prompt + image_urls, фиксированное разрешение 1K и вертикальное соотношение сторон.
  const falInput =
    effectiveModel === FAL_MODEL_DEFAULT
      ? {
          prompt: prompt?.trim() || buildRandomTryOnPrompt(),
          image_urls: [personImageUrl, clothingImageUrl],
          num_images: 1,
          aspect_ratio: '9:16' as const,
          output_format: 'png' as const,
          resolution: '1K' as const,
        }
      : {
          person_image_url: personImageUrl,
          clothing_image_url: clothingImageUrl,
          preserve_pose: true,
        };

  const res = await fetch(`https://queue.fal.run/${effectiveModel}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(falInput),
  });

  const raw = await res.text();
  let data: FalPayload & { detail?: string; message?: string };
  try {
    data = JSON.parse(raw) as FalPayload & { detail?: string; message?: string };
  } catch {
    console.error('[Fal] invalid JSON', raw.slice(0, 200));
    throw new Error('Fal вернул неверный ответ.');
  }

  if (res.ok && firstImageUrl(data)) {
    return firstImageUrl(data)!;
  }

  // 402/429 — квота/токены: явно пробрасываем для fallback на KIE (rate_limit).
  if (res.status === 402 || res.status === 429) {
    const detail = data?.detail ?? data?.message ?? raw?.slice?.(0, 200) ?? '';
    const msg = detail ? `Fal ${res.status} (quota/rate): ${detail}` : `Fal ${res.status} quota or rate limit.`;
    throw new Error(msg);
  }

  // 422 — модель не смогла обработать входные изображения (плохое фото, формат и т.д.)
  if (res.status === 422 && raw.toLowerCase().includes('validating')) {
    throw new Error('BAD_INPUT: Не удалось обработать фото. Попробуйте загрузить другое.');
  }

  const needPoll =
    (res.status === 202 || (res.ok && data?.status === 'IN_QUEUE')) && data?.status_url;
  if (!needPoll) {
    console.error('[Fal] no taskId/status_url', res.status, Object.keys(data));
    throw new Error(data?.status === 'FAILED' ? 'Fal: генерация не удалась.' : 'Fal не вернул задачу.');
  }

  const statusUrl = data.status_url!;
  const deadline = Date.now() + FAL_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const statusRes = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } });
    const statusRaw = await statusRes.text();
    let statusData: FalPayload;
    try {
      statusData = JSON.parse(statusRaw) as FalPayload;
    } catch {
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }

    if (statusData?.status === 'COMPLETED') {
      let imageUrl = firstImageUrl(statusData);
      if (!imageUrl && statusData.response_url) {
        const resultRes = await fetch(statusData.response_url, {
          headers: { Authorization: `Key ${key}` },
        });
        const resultJson = (await resultRes.json()) as FalPayload;
        imageUrl = firstImageUrl(resultJson);
      }
      if (imageUrl) return imageUrl;
    }
    if (statusData?.status === 'FAILED') {
      throw new Error('Fal: генерация не удалась.');
    }

    await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
  }

  const err = new Error('Превышено время ожидания Fal. Попробуйте ещё раз.') as Error & { isFalTimeout?: boolean };
  err.isFalTimeout = true;
  throw err;
}
