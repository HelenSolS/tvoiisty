/**
 * Минимальный клиент Fal для примерки на бэкенде.
 * Принимает URL фото человека и одежды, возвращает URL результата.
 * Используется как fallback, когда KIE не вернул taskId или вернул ошибку.
 */

const FAL_MODEL = 'fal-ai/image-apps-v2/virtual-try-on';
const FAL_POLL_TIMEOUT_MS = 55_000;
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

export async function tryOnWithFal(personImageUrl: string, clothingImageUrl: string): Promise<string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) {
    throw new Error('FAL_KEY не задан. Задайте в .env для fallback-примерки.');
  }

  const res = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      person_image_url: personImageUrl,
      clothing_image_url: clothingImageUrl,
      preserve_pose: true,
    }),
  });

  const raw = await res.text();
  let data: FalPayload;
  try {
    data = JSON.parse(raw) as FalPayload;
  } catch {
    console.error('[Fal] invalid JSON', raw.slice(0, 200));
    throw new Error('Fal вернул неверный ответ.');
  }

  if (res.ok && firstImageUrl(data)) {
    return firstImageUrl(data)!;
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
