/**
 * KIE (Kernel Image Engine) image try-on provider. createTask + recordInfo polling.
 */

import type { GenerateImagePayload, GenerateImageResult } from '../provider-abstraction.js';
import { DEFAULT_IMAGE_PROMPT } from '../provider-abstraction.js';

const DEFAULT_KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 60;

export async function runKieTryOn(
  payload: GenerateImagePayload,
  startTs: number,
  env: { KIE_BASE_URL?: string; KIE_API_KEY?: string }
): Promise<GenerateImageResult> {
  const { personUrl, clothingUrl, prompt, model } = payload;
  const apiKey = env.KIE_API_KEY;
  if (!apiKey) {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 500,
      error: 'Сервис временно недоступен. Попробуйте позже.',
    };
  }

  const KIE_BASE = (env.KIE_BASE_URL || DEFAULT_KIE_BASE).replace(/\/$/, '');
  const isGptImage15 = model === 'gpt-image/1.5-image-to-image';
  const inputPayload = isGptImage15
    ? {
        input_urls: [personUrl, clothingUrl],
        prompt: prompt || DEFAULT_IMAGE_PROMPT,
        aspect_ratio: '2:3' as const,
        quality: 'medium' as const,
      }
    : {
        aspect_ratio: '9:16' as const,
        prompt: prompt || DEFAULT_IMAGE_PROMPT,
        resolution: '1K' as const,
        input_urls: [personUrl, clothingUrl],
      };

  const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: inputPayload }),
  });

  let createData: {
    data?: { taskId?: string; creditsUsed?: number };
    message?: string;
    msg?: string;
    code?: number;
  } = {};
  try {
    createData = (await createRes.json()) as typeof createData;
  } catch {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 502,
      error: 'Не удалось сгенерировать изображение. Попробуйте позже.',
    };
  }

  const creditsUsed = createData?.data?.creditsUsed;
  if (!createRes.ok) {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 502,
      error: 'Не удалось сгенерировать изображение. Попробуйте позже.',
      credits_used: creditsUsed,
    };
  }
  if (createData.code !== undefined && createData.code !== 200) {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 502,
      error: 'Не удалось сгенерировать изображение. Попробуйте позже.',
      credits_used: creditsUsed,
    };
  }

  const taskId = createData?.data?.taskId;
  if (!taskId) {
    const duration_ms = Date.now() - startTs;
    return {
      status: 'error',
      model,
      duration_ms,
      httpStatus: 502,
      error: 'Не удалось сгенерировать изображение. Попробуйте позже.',
      credits_used: creditsUsed,
    };
  }

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const jobRes = await fetch(
      `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    let jobData: {
      data?: { state?: string; resultJson?: string; failMsg?: string };
      message?: string;
    } = {};
    try {
      jobData = (await jobRes.json()) as typeof jobData;
    } catch {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    if (!jobRes.ok) {
      const duration_ms = Date.now() - startTs;
      return {
        status: 'error',
        model,
        duration_ms,
        httpStatus: 502,
        error: 'Не удалось получить результат. Попробуйте позже.',
        credits_used: creditsUsed,
      };
    }

    const state = jobData?.data?.state;
    if (state === 'success') {
      let imageUrl: string | undefined;
      try {
        const resultJson = jobData?.data?.resultJson;
        if (typeof resultJson === 'string') {
          const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
          imageUrl = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : undefined;
        }
      } catch {
        // fall through
      }
      if (imageUrl) {
        const duration_ms = Date.now() - startTs;
        return {
          status: 'success',
          model,
          duration_ms,
          imageUrl,
          credits_used: creditsUsed,
        };
      }
      const duration_ms = Date.now() - startTs;
      return {
        status: 'error',
        model,
        duration_ms,
        httpStatus: 500,
        error: 'Не удалось сгенерировать изображение. Попробуйте позже.',
        credits_used: creditsUsed,
      };
    }

    if (state === 'fail') {
      const duration_ms = Date.now() - startTs;
      let userMessage =
        jobData?.data?.failMsg?.trim() ?? 'Генерация не удалась. Попробуйте снова.';
      if (/internal error, please try again later/i.test(userMessage)) {
        userMessage =
          'Сервис перегружен или не принял изображения. Уменьшите размер фото (до ~1 МБ) и попробуйте снова.';
      }
      return {
        status: 'error',
        model,
        duration_ms,
        httpStatus: 422,
        error: userMessage,
        credits_used: creditsUsed,
      };
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const duration_ms = Date.now() - startTs;
  return {
    status: 'error',
    model,
    duration_ms,
    httpStatus: 408,
    error: 'Превышено время ожидания. Попробуйте ещё раз.',
    credits_used: creditsUsed,
  };
}
