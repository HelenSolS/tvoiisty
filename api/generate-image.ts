/**
 * Backend-эндпоинт: примерка (try-on) через KIE.
 * POST /api/v1/jobs/createTask. KIE принимает в input_urls только https-URL; data/base64 загружаем в Vercel Blob.
 * Лаборатория (dev): принимает model из body и выбирает из пула. Production: один ключ, модель из env или по умолчанию.
 */

import { put } from '@vercel/blob';

const DEFAULT_KIE_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 60; // ~2 минуты макс

/** Модели KIE (Lab + production). */
const KIE_IMAGE_MODEL_POOL = [
  'flux-2/flex-image-to-image',
  'google/nano-banana-edit',
  'gpt-image/1.5-image-to-image',
  'qwen/image-edit',
  'grok-imagine/image-to-image',
  'ideogram/v3-edit',
] as const;

/** Модели Fal AI (альтернатива KIE). В Vercel: FAL_KEY (один ключ для всех Fal). */
const FAL_IMAGE_MODEL_POOL = [
  'fal-ai/image-apps-v2/virtual-try-on',
  'fal-ai/fashn/tryon/v1.6',
  'fal-ai/nano-banana-pro/edit',
] as const;

const ALL_IMAGE_MODELS = [...KIE_IMAGE_MODEL_POOL, ...FAL_IMAGE_MODEL_POOL] as readonly string[];

const DEFAULT_IMAGE_MODEL = process.env.KIE_IMAGE_MODEL || 'flux-2/flex-image-to-image';

function isFalModel(model: string): boolean {
  return (FAL_IMAGE_MODEL_POOL as readonly string[]).includes(model);
}

function resolveImageModel(bodyModel: unknown): string {
  if (typeof bodyModel === 'string' && ALL_IMAGE_MODELS.includes(bodyModel)) return bodyModel;
  return DEFAULT_IMAGE_MODEL;
}

/** Единый стандартный промпт для всех моделей (KIE, Fal). На человека с фото надеть одежду с фото, консистентность персонажа и одежды, естественно и стильно. */
const DEFAULT_IMAGE_PROMPT =
  'Put the garment from the second image onto the person in the first image. Preserve character consistency, garment consistency, and body shape. Dress naturally, beautifully and stylishly this outfit from the photo. Background: soft beige-gray or light concrete, clean and distraction-free. Style: hyper-realistic high-end fashion photography. Lighting: soft directional side light with subtle rim light. Mood: premium, confident, modern. Composition: rule of thirds, subject centered, vertical frame. Camera: Sony A7R V, 85mm f/1.8. Format: vertical.';

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

  const KIE_BASE = (process.env.KIE_BASE_URL || DEFAULT_KIE_BASE).replace(/\/$/, '');
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.error('[generate-image] KIE_API_KEY not set');
    return res
      .status(500)
      .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const model = resolveImageModel(body.model);
  const startTs = Date.now();

  try {
    const { personImageBase64, clothingImageBase64, prompt } = body as {
      personImageBase64?: string;
      clothingImageBase64?: string;
      prompt?: string;
    };

    console.error('[generate-image] request', {
      model,
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

    // Fal AI (альтернатива KIE): virtual-try-on, FASHN v1.6 или nano-banana-pro/edit — разные имена полей
    if (isFalModel(model)) {
      const falKey = process.env.FAL_KEY;
      if (!falKey) {
        console.error('[generate-image] FAL_KEY not set for Fal model', model);
        return res.status(503).json({ error: 'Сервис примерки (Fal) недоступен. Попробуйте другую модель.' });
      }
      const isFashn = model === 'fal-ai/fashn/tryon/v1.6';
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
        : isFashn
          ? {
              model_image: personUrl,
              garment_image: clothingUrl,
              category: 'auto' as const,
              mode: 'quality' as const,
              garment_photo_type: 'auto' as const,
              num_samples: 1,
              output_format: 'png' as const,
            }
          : { person_image_url: personUrl, clothing_image_url: clothingUrl, preserve_pose: true };
      const falUrl = `https://queue.fal.run/${model}`;
      // Fal: 1) POST submit (Input по доке), 2) при 200+IN_QUEUE — GET /requests/{request_id} до result. Output: images[].url (nano-banana: fal-ai/nano-banana-pro/edit)
      const falRes = await fetch(falUrl, {
        method: 'POST',
        headers: {
          Authorization: `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(falInput),
      });
      const rawBody = await falRes.text();
      let falData: {
        images?: Array<{ url?: string }>;
        data?: { images?: Array<{ url?: string }> };
        request_id?: string;
        status?: string;
      };
      try {
        falData = JSON.parse(rawBody) as typeof falData;
      } catch (parseErr) {
        console.error('[generate-image] Fal response not JSON', { model, status: falRes.status, bodyPreview: rawBody.slice(0, 300) });
        return res.status(502).json({ error: 'Не удалось сгенерировать изображение. Попробуйте другую модель.' });
      }
      const firstImageUrl = (d: typeof falData) =>
        d?.images?.[0]?.url ?? d?.data?.images?.[0]?.url;
      if (falRes.ok && firstImageUrl(falData)) {
        const totalMs = Date.now() - startTs;
        console.error('[generate-image] Fal success', { model, durationMs: totalMs });
        return res.status(200).json({ imageUrl: firstImageUrl(falData)! });
      }
      if ((falRes.status === 202 || (falRes.ok && falData?.status === 'IN_QUEUE')) && falData?.request_id) {
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const resultRes = await fetch(`${falUrl}/requests/${falData.request_id}`, {
            headers: { Authorization: `Key ${falKey}` },
          });
          const resultRaw = await resultRes.text();
          let resultData: { images?: Array<{ url?: string }>; data?: { images?: Array<{ url?: string }> }; status?: string };
          try {
            resultData = JSON.parse(resultRaw) as typeof resultData;
          } catch {
            continue;
          }
          if (resultRes.ok && firstImageUrl(resultData)) {
            const totalMs = Date.now() - startTs;
            console.error('[generate-image] Fal success (poll)', { model, durationMs: totalMs });
            return res.status(200).json({ imageUrl: firstImageUrl(resultData)! });
          }
          if (resultData?.status === 'FAILED') break;
        }
      }
      console.error('[generate-image] Fal failed', { model, status: falRes.status, data: falData });
      return res.status(502).json({ error: 'Не удалось сгенерировать изображение. Попробуйте другую модель.' });
    }

    // 1) KIE jobs/createTask — формат input разный у моделей (см. docs KIE)
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
      body: JSON.stringify({
        model,
        input: inputPayload,
      }),
    });

    let createData: {
      data?: { taskId?: string; creditsUsed?: number };
      message?: string;
      msg?: string;
      code?: number;
    } = {};
    try {
      createData = (await createRes.json()) as typeof createData;
    } catch (e) {
      const endTs = Date.now();
      console.error('[generate-image] createTask', { model, startTs, endTs, durationMs: endTs - startTs, httpStatus: createRes.status, error: 'response not JSON' });
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const endTs = Date.now();
    const durationMs = endTs - startTs;
    const creditsUsed = createData?.data?.creditsUsed;
    console.error('[generate-image] createTask', { model, startTs, endTs, durationMs, httpStatus: createRes.status, creditsUsed, ...(createData?.msg ? { msg: createData.msg } : {}), ...(createData?.message ? { message: createData.message } : {}) });

    if (!createRes.ok) {
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const code = createData.code;
    if (code !== undefined && code !== 200) {
      return res
        .status(502)
        .json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
    }

    const taskId = createData?.data?.taskId;
    if (!taskId) {
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
          const totalMs = Date.now() - startTs;
          console.error('[generate-image] success', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 200 });
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
        const totalMs = Date.now() - startTs;
        const failMsg = jobData?.data?.failMsg;
        console.error('[generate-image] job state=fail', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 422, errorMessage: failMsg });
        let userMessage =
          failMsg && failMsg.trim()
            ? failMsg.trim()
            : 'Генерация не удалась. Попробуйте снова.';
        if (/internal error, please try again later/i.test(userMessage)) {
          userMessage = 'Сервис перегружен или не принял изображения. Уменьшите размер фото (до ~1 МБ) и попробуйте снова.';
        }
        return res.status(422).json({ error: userMessage });
      }

      // пока state не success/fail — ждём
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    const totalMs = Date.now() - startTs;
    console.error('[generate-image] timeout', { model, startTs, endTs: Date.now(), durationMs: totalMs, httpStatus: 408 });
    return res.status(408).json({
      error: 'Превышено время ожидания. Попробуйте ещё раз.',
    });
  } catch (err: unknown) {
    const totalMs = Date.now() - startTs;
    console.error('[generate-image] error', { model, startTs, endTs: Date.now(), durationMs: totalMs, errorMessage: err instanceof Error ? err.message : String(err) });
    return res
      .status(500)
      .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
