/**
 * Backend-эндпоинт: примерка (try-on) через Provider Abstraction Layer (Fal / KIE).
 * POST body: personImageBase64, clothingImageBase64, prompt?, model?.
 * Endpoint переключается по model: fal-ai/* → Fal, иначе → KIE.
 * Ответ: imageUrl, model, duration_ms, status, credits_used? (Issue #15).
 */

import { put } from '@vercel/blob';
import { generateImage, getImageProvider } from './_lib/provider-abstraction';

/** Модели KIE (Lab + production). */
const KIE_IMAGE_MODEL_POOL = [
  'flux-2/flex-image-to-image',
  'google/nano-banana-edit',
  'gpt-image/1.5-image-to-image',
  'qwen/image-edit',
  'grok-imagine/image-to-image',
  'ideogram/v3-edit',
] as const;

/** Модели Fal AI. */
const FAL_IMAGE_MODEL_POOL = [
  'fal-ai/image-apps-v2/virtual-try-on',
  'fal-ai/nano-banana-pro/edit',
] as const;

const ALL_IMAGE_MODELS = [...KIE_IMAGE_MODEL_POOL, ...FAL_IMAGE_MODEL_POOL] as readonly string[];
const DEFAULT_IMAGE_MODEL = process.env.KIE_IMAGE_MODEL || 'flux-2/flex-image-to-image';

function resolveImageModel(bodyModel: unknown): string {
  if (typeof bodyModel === 'string' && ALL_IMAGE_MODELS.includes(bodyModel)) return bodyModel;
  return DEFAULT_IMAGE_MODEL;
}

/** Если не https-URL — загружаем в Blob и возвращаем URL. */
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
    console.error('[generate-image] Blob URL is private — use a PUBLIC Blob store and BLOB_READ_WRITE_TOKEN.');
  }
  return blob.url;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> },
  res: { status: (n: number) => { json: (o: object) => void } },
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const model = resolveImageModel(body.model);
  const provider = getImageProvider(model);
  if (provider === 'kie' && !process.env.KIE_API_KEY) {
    console.error('[generate-image] KIE_API_KEY not set');
    return res.status(500).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }

  const startTs = Date.now();
  try {
    const { personImageBase64, clothingImageBase64, prompt } = body as {
      personImageBase64?: string;
      clothingImageBase64?: string;
      prompt?: string;
    };

    console.error('[generate-image] request', {
      model,
      provider,
      personLen: personImageBase64?.length ?? 0,
      clothingLen: clothingImageBase64?.length ?? 0,
      promptLen: prompt?.length ?? 0,
    });

    if (!personImageBase64 || !clothingImageBase64) {
      return res.status(400).json({ error: 'Недостаточно данных для примерки.' });
    }

    const needUpload =
      !personImageBase64.startsWith('https://') || !clothingImageBase64.startsWith('https://');
    if (needUpload && !process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('[generate-image] BLOB_READ_WRITE_TOKEN not set');
      return res.status(503).json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
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
      return res.status(502).json({ error: 'Не удалось подготовить изображения. Попробуйте позже.' });
    }

    /** Fallback KIE→Fal: по умолчанию включён (как раньше). Выключить можно из админки (fallbackOnError: false). */
    const fallbackOnError = body.fallbackOnError !== false;
    const result = await generateImage(
      {
        personUrl,
        clothingUrl,
        prompt: prompt ?? undefined,
        model,
      },
      { fallbackOnError }
    );

    if (result.status === 'success') {
      const imageUrl = result.imageUrl;
      if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
        console.error('[generate-image] invalid success: no imageUrl', { model: result.model });
        return res.status(502).json({ error: 'Не удалось сгенерировать изображение. Попробуйте позже.' });
      }
      return res.status(200).json({
        imageUrl: imageUrl.trim(),
        model: result.model,
        duration_ms: result.duration_ms,
        status: result.status,
        ...(result.credits_used != null && { credits_used: result.credits_used }),
      });
    }

    console.error('[generate-image] error', {
      model: result.model,
      durationMs: result.duration_ms,
      httpStatus: result.httpStatus,
      error: result.error,
    });
    return res.status(result.httpStatus).json({
      error: result.error,
      model: result.model,
      duration_ms: result.duration_ms,
      ...(result.credits_used != null && { credits_used: result.credits_used }),
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - startTs;
    console.error('[generate-image] error', {
      model,
      durationMs,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return res
      .status(500)
      .json({ error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
