/**
 * Backend-эндпоинт: примерка (try-on) через KIE.
 * Ключ KIE читается только здесь (process.env.KIE_API_KEY), на фронт не передаётся.
 * Эндпоинт: POST https://api.kie.ai/api/v1/jobs/createTask. KIE принимает в input_urls только https-URL; data/base64 загружаем в Vercel Blob.
 */

import { put } from '@vercel/blob';

const DEFAULT_KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 2000;

type ProviderId = 'default' | 'backup';

function getKieConfig(provider: ProviderId): { base: string; apiKey: string | undefined } {
  if (provider === 'backup') {
    const base = process.env.KIE_BACKUP_BASE_URL;
    const apiKey = process.env.KIE_BACKUP_API_KEY;
    if (base && apiKey) return { base: base.replace(/\/$/, ''), apiKey };
  }
  return {
    base: (process.env.KIE_BASE_URL || DEFAULT_KIE_BASE).replace(/\/$/, ''),
    apiKey: process.env.KIE_API_KEY,
  };
}
const POLL_MAX_ATTEMPTS = 60; // ~2 минуты макс
const MODEL_IMAGE = process.env.KIE_IMAGE_MODEL || 'flux-2/flex-image-to-image';

/** Если строка не https-URL — загружаем в Blob и возвращаем URL. Иначе возвращаем как есть. */
async function ensureHttpsUrl(value: string, filename: string): Promise<string> {
  if (value.startsWith('https://')) return value;
  let base64 = value;
  if (value.startsWith('data:')) {
    const i = value.indexOf(',');
    if (i === -1) throw new Error('Invalid data URL');
    base64 = value.slice(i + 1);
  }
  const buf = Buffer.from(base64, 'base64');
  const blob = await put(`tryon/${Date.now()}-${filename}`, buf, { access: 'public' });
  if (blob.url.includes('private.blob.vercel-storage.com')) {
    console.error('[generate-image] Blob URL is private — KIE cannot fetch it. Create a PUBLIC Blob store in Vercel (Storage → Blob) and set BLOB_READ_WRITE_TOKEN from that store.');
  }
  return blob.url;
}

// Эндпоинт Vercel Serverless: (req, res) — типы через any, чтобы не тянуть @vercel/node
export default async function handler(
  req: { method?: string; body?: Record<string, unknown> },
  res: { status: (n: number) => { json: (o: object) => void } },
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const provider = ((req.body as Record<string, unknown>)?.provider === 'backup' ? 'backup' : 'default') as ProviderId;
  const { base: KIE_BASE, apiKey } = getKieConfig(provider);
  if (!apiKey) {
    console.error('[generate-image] API key not set for provider', provider);
    return res
      .status(500)
      .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
  console.error('[generate-image] provider', provider, 'base', KIE_BASE);

  try {
    const { personImageBase64, clothingImageBase64, prompt } = (req.body ||
      {}) as {
      personImageBase64?: string;
      clothingImageBase64?: string;
      prompt?: string;
    };

    // Лог для анализа 422/413: только размеры, без содержимого и ключей
    console.error('[generate-image] request', {
      personLen: personImageBase64?.length ?? 0,
      clothingLen: clothingImageBase64?.length ?? 0,
      promptLen: prompt?.length ?? 0,
    });

    if (!personImageBase64 || !clothingImageBase64) {
      return res
        .status(400)
        .json({ error: 'Недостаточно данных для примерки.' });
    }

    const needUpload = !personImageBase64.startsWith('https://') || !clothingImageBase64.startsWith('https://');
    if (needUpload && !process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('[generate-image] BLOB_READ_WRITE_TOKEN not set — add Blob Store in Vercel (Storage → Blob) and set env var');
      return res
        .status(503)
        .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
    }

    let personUrl: string;
    let clothingUrl: string;
    try {
      [personUrl, clothingUrl] = await Promise.all([
        ensureHttpsUrl(personImageBase64, 'person.png'),
        ensureHttpsUrl(clothingImageBase64, 'clothing.png'),
      ]);
    } catch (e) {
      console.error('[generate-image] upload to Blob failed', e);
      return res
        .status(502)
        .json({ error: 'Не удалось подготовить изображения. Попробуйте позже.' });
    }

    // 1) KIE jobs/createTask (input_urls — только https-URL)
    const inputPayload = {
      aspect_ratio: '1:1',
      prompt: prompt || 'Virtual try-on: dress the person in the outfit from the second image naturally.',
      resolution: '1K',
      input_urls: [personUrl, clothingUrl],
    };
    const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_IMAGE,
        input: JSON.stringify(inputPayload),
      }),
    });

    let createData: {
      data?: { taskId?: string };
      message?: string;
      msg?: string;
      code?: number;
    } = {};
    try {
      createData = (await createRes.json()) as typeof createData;
    } catch (e) {
      console.error('[generate-image] createTask response not JSON', e);
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    if (!createRes.ok) {
      console.error(
        '[generate-image] createTask HTTP',
        createRes.status,
        createData,
      );
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const code = createData.code;
    if (code !== undefined && code !== 200) {
      console.error(
        '[generate-image] createTask body code',
        code,
        createData?.msg || createData?.message,
      );
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      console.error(
        '[generate-image] createTask no taskId in response',
        createData,
      );
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    // 2) Опрос результата: KIE — GET jobs/recordInfo?taskId=..., state: success|fail, resultJson с resultUrls
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const jobRes = await fetch(
        `${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );

      let jobData: {
        data?: { state?: string; resultJson?: string; failMsg?: string };
        message?: string;
      } = {};
      try {
        jobData = (await jobRes.json()) as typeof jobData;
      } catch {
        // ответ не JSON — подождём ещё немного
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      if (!jobRes.ok) {
        console.error(
          '[generate-image] recordInfo HTTP',
          jobRes.status,
          jobData,
        );
        return res
          .status(502)
          .json({ error: 'Не удалось получить результат. Попробуйте позже.' });
      }

      const state = jobData?.data?.state;
      if (state === 'success') {
        let imageUrl: string | undefined;
        try {
          const resultJson = jobData?.data?.resultJson;
          if (typeof resultJson === 'string') {
            const parsed = JSON.parse(resultJson) as {
              resultUrls?: string[];
            };
            imageUrl = Array.isArray(parsed?.resultUrls)
              ? parsed.resultUrls[0]
              : undefined;
          }
        } catch {
          // игнорируем, упадём в лог ниже
        }

        if (imageUrl) {
          return res.status(200).json({ imageUrl });
        }

        console.error(
          '[generate-image] success state but no imageUrl in resultJson',
          jobData?.data,
        );
        return res
          .status(500)
          .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
      }

      if (state === 'fail') {
        // В лог — сырой текст от KIE для отладки; клиенту — только русский
        console.error('[generate-image] job state=fail', jobData?.data?.failMsg);
        return res.status(422).json({
          error: 'Генерация не удалась. Попробуйте снова.',
        });
      }

      // пока state не success/fail — ждём
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return res.status(408).json({
      error: 'Превышено время ожидания. Попробуйте ещё раз.',
    });
  } catch (err: unknown) {
    console.error('[generate-image]', err);
    return res
      .status(500)
      .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
