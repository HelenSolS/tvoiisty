/**
 * KIE (Kernel Image Engine) image try-on provider. createTask + recordInfo polling.
 */

import type { GenerateImagePayload, GenerateImageResult } from '../provider-abstraction.js';
import { DEFAULT_IMAGE_PROMPT } from '../provider-abstraction.js';

const DEFAULT_KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 90; // до ~3 мин, чтобы не отдавать 408 пока задача ещё в работе

function calcKieIntervalMs(elapsedMs: number): number {
  if (elapsedMs < 15_000) return 700;
  if (elapsedMs < 60_000) return POLL_INTERVAL_MS;
  return 4_000;
}

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

  type KieJobRecord = {
    data?: {
      state?: string;
      successFlag?: number | string;
      resultJson?: string;
      response?: { result_urls?: string[] };
      failMsg?: string;
    };
    message?: string;
  };

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const jobRes = await fetch(
      `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  let jobData: KieJobRecord = {};
  try {
    jobData = (await jobRes.json()) as KieJobRecord;
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
  const successFlag = jobData?.data?.successFlag;
  const isSuccess =
    (state && String(state).toLowerCase() === 'success') ||
    successFlag === 1 ||
    successFlag === '1';

  if (isSuccess) {
    let imageUrl: string | undefined;
    const resp = jobData?.data?.response;
    if (Array.isArray(resp?.result_urls) && resp.result_urls[0]) {
      imageUrl = resp.result_urls[0];
    }
    if (!imageUrl) {
      try {
        const resultJson = jobData?.data?.resultJson;
        if (typeof resultJson === 'string') {
          const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
          imageUrl = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : undefined;
        }
      } catch {
        // fall through
      }
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

  const stateStr = state ? String(state).toLowerCase() : '';
  if (stateStr === 'fail' || successFlag === 2 || successFlag === '2' || successFlag === 3 || successFlag === '3') {
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

    const elapsed = Date.now() - startTs;
    const waitMs = calcKieIntervalMs(elapsed);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  // Последний опрос перед 408: картинка могла только что стать готовой — не отдаём ошибку без проверки.
  const lastRes = await fetch(
    `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  let lastData: KieJobRecord = {};
  try {
    lastData = (await lastRes.json()) as KieJobRecord;
  } catch {
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
  if (lastRes.ok) {
    const s = lastData?.data?.state;
    const sf = lastData?.data?.successFlag;
    const ok =
      (s && String(s).toLowerCase() === 'success') || sf === 1 || sf === '1';
    if (ok) {
      let imageUrl: string | undefined;
      const resp = lastData?.data?.response;
      if (Array.isArray(resp?.result_urls) && resp.result_urls[0]) {
        imageUrl = resp.result_urls[0];
      }
      if (!imageUrl && typeof lastData?.data?.resultJson === 'string') {
        try {
          const parsed = JSON.parse(lastData.data.resultJson) as { resultUrls?: string[] };
          imageUrl = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : undefined;
        } catch {
          // ignore
        }
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
    }
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
