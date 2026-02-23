/**
 * Fal AI image try-on provider. Queue: IN_QUEUE → poll status_url → COMPLETED/FAILED.
 */

import type { GenerateImagePayload, GenerateImageResult } from '../provider-abstraction';
import { DEFAULT_IMAGE_PROMPT } from '../provider-abstraction';

const FAL_POLL_TIMEOUT_MS = 55_000;
const FAL_POLL_INTERVAL_MS = 1500;

function calcFalIntervalMs(elapsedMs: number): number {
  if (elapsedMs < 15_000) return 700;
  if (elapsedMs < 60_000) return FAL_POLL_INTERVAL_MS;
  return 4_000;
}

type FalQueuePayload = {
  status?: 'IN_QUEUE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  status_url?: string;
  response_url?: string;
  images?: Array<{ url?: string }>;
  data?: { images?: Array<{ url?: string }> };
  request_id?: string;
  error?: unknown;
  logs?: unknown;
};

function firstImageUrl(d: FalQueuePayload): string | undefined {
  return d?.images?.[0]?.url ?? d?.data?.images?.[0]?.url;
}

export async function runFalTryOn(
  payload: GenerateImagePayload,
  startTs: number
): Promise<GenerateImageResult> {
  const { personUrl, clothingUrl, prompt, model } = payload;
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 503,
      error: 'Сервис примерки (Fal) недоступен. Попробуйте другую модель.',
    };
  }

  const isNanoBanana = model === 'fal-ai/nano-banana-pro/edit';
  const falInput = isNanoBanana
    ? {
        prompt: prompt || DEFAULT_IMAGE_PROMPT,
        image_urls: [personUrl, clothingUrl],
        num_images: 1,
        aspect_ratio: '9:16' as const,
        output_format: 'png' as const,
        resolution: '1K' as const,
      }
    : { person_image_url: personUrl, clothing_image_url: clothingUrl, preserve_pose: true };

  const falUrl = `https://queue.fal.run/${model}`;
  const falRes = await fetch(falUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(falInput),
  });
  const rawBody = await falRes.text();
  let falData: FalQueuePayload;
  try {
    falData = JSON.parse(rawBody) as FalQueuePayload;
  } catch {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 502,
      error: 'Не удалось сгенерировать изображение. Попробуйте другую модель.',
    };
  }

  if (falRes.ok && firstImageUrl(falData)) {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'success',
      model,
      duration_ms,
      imageUrl: firstImageUrl(falData)!,
    };
  }

  const needPoll =
    (falRes.status === 202 || (falRes.ok && falData?.status === 'IN_QUEUE')) &&
    falData?.status_url;

  if (!needPoll) {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 502,
      error: 'Не удалось сгенерировать изображение. Попробуйте другую модель.',
    };
  }

  const statusUrl = falData.status_url!;
  const pollStartedAt = Date.now();

  while (true) {
    if (Date.now() - pollStartedAt > FAL_POLL_TIMEOUT_MS) {
      const duration_ms = Date.now() - startTs;
      const finalRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${falKey}` },
      });
      const finalRaw = await finalRes.text();
      let finalData: FalQueuePayload;
      try {
        finalData = JSON.parse(finalRaw) as FalQueuePayload;
      } catch {
        return {
          status: 'error',
          model,
          duration_ms,
          httpStatus: 408,
          error: 'Превышено время ожидания. Попробуйте ещё раз.',
        };
      }
      if (finalData?.status === 'COMPLETED') {
        let imageUrl = firstImageUrl(finalData);
        if (!imageUrl && finalData.response_url) {
          const resultRes = await fetch(finalData.response_url, {
            headers: { Authorization: `Key ${falKey}` },
          });
          const resultRaw = await resultRes.text();
          try {
            const resultJson = JSON.parse(resultRaw) as FalQueuePayload;
            imageUrl = firstImageUrl(resultJson);
          } catch {
            return {
              status: 'error',
              model,
              duration_ms,
              httpStatus: 502,
              error: 'Не удалось получить результат. Попробуйте другую модель.',
            };
          }
        }
        if (imageUrl) {
          return { status: 'success', model, duration_ms, imageUrl };
        }
      }
      return {
        status: 'error',
        model,
        duration_ms,
        httpStatus: 408,
        error: 'Превышено время ожидания. Попробуйте ещё раз.',
      };
    }

    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    const statusRaw = await statusRes.text();
    let statusData: FalQueuePayload;
    try {
      statusData = JSON.parse(statusRaw) as FalQueuePayload;
    } catch {
      await new Promise((r) => setTimeout(r, FAL_POLL_INTERVAL_MS));
      continue;
    }

    if (statusData?.status === 'COMPLETED') {
      let imageUrl = firstImageUrl(statusData);
      if (!imageUrl && statusData.response_url) {
        const resultRes = await fetch(statusData.response_url, {
          headers: { Authorization: `Key ${falKey}` },
        });
        const resultRaw = await resultRes.text();
        try {
          const resultJson = JSON.parse(resultRaw) as FalQueuePayload;
          imageUrl = firstImageUrl(resultJson);
        } catch {
          const duration_ms = Date.now() - startTs;
          return {
            status: 'error',
            model,
            duration_ms,
            httpStatus: 502,
            error: 'Не удалось получить результат. Попробуйте другую модель.',
          };
        }
      }
      if (imageUrl) {
        const duration_ms = Date.now() - startTs;
        return { status: 'success', model, duration_ms, imageUrl };
      }
      const duration_ms = Date.now() - startTs;
      return {
        status: 'error',
        model,
        duration_ms,
        httpStatus: 502,
        error: 'Не удалось сгенерировать изображение. Попробуйте другую модель.',
      };
    }

    if (statusData?.status === 'FAILED') {
      const duration_ms = Date.now() - startTs;
      return {
        status: 'error',
        model,
        duration_ms,
        httpStatus: 502,
        error: 'Генерация не удалась. Попробуйте другую модель или фото.',
      };
    }

    const elapsed = Date.now() - pollStartedAt;
    const waitMs = calcFalIntervalMs(elapsed);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}
