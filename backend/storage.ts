import { put as vercelPut } from '@vercel/blob';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'media';

const useSupabase = SUPABASE_URL.trim() !== '' && SUPABASE_SERVICE_KEY.trim() !== '';

interface UploadParams {
  type: 'person' | 'clothing' | 'location' | 'tryon_result_image' | 'tryon_result_video';
  buffer: Buffer;
  filename: string;
}

export interface StoredObject {
  url: string;
  storageKey: string;
}

async function uploadToSupabase(params: UploadParams): Promise<StoredObject> {
  const { buffer, filename, type } = params;
  const path = `media/${type}/${Date.now()}-${filename}`;

  const res = await fetch(
    // В Supabase путь должен быть вида /object/<bucket>/<path> без URL-энкодинга слэшей.
    // Кодирование всей строки как единичного сегмента даёт 404 вида
    // "Route POST:/object/media%2Fmedia%2Fperson/.. not found".
    `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${SUPABASE_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: buffer,
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[storage] supabase upload error', res.status, text);
    throw new Error('Не удалось сохранить файл в хранилище.');
  }

  const publicUrl = `${SUPABASE_URL.replace(
    /\/$/,
    '',
  )}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;

  return {
    url: publicUrl,
    storageKey: path,
  };
}

async function uploadToVercelBlob(params: UploadParams): Promise<StoredObject> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[storage] BLOB_READ_WRITE_TOKEN not set');
    throw new Error('Хранилище временно недоступно. Попробуйте позже.');
  }

  const blob = await vercelPut(`media/${params.type}/${Date.now()}-${params.filename}`, params.buffer, {
    // В проде store настроен как public, поэтому Blob SDK требует access: "public".
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const storageKey = new URL(blob.url).pathname.replace(/^\//, '');
  return {
    url: blob.url,
    storageKey,
  };
}

export async function uploadBuffer(params: UploadParams): Promise<StoredObject> {
  if (useSupabase) {
    try {
      return await uploadToSupabase(params);
    } catch (err) {
      console.error('[storage] supabase failed, trying vercel blob fallback', err);
      // Падаем в Vercel Blob только если он настроен.
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        return uploadToVercelBlob(params);
      }
      throw err;
    }
  }

  return uploadToVercelBlob(params);
}

export async function mirrorFromUrl(
  url: string,
  params: Omit<UploadParams, 'buffer' | 'filename'> & { filename: string },
): Promise<StoredObject> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error('[storage] mirrorFromUrl fetch failed', url, res.status, res.statusText);
    throw new Error('Не удалось скачать файл для сохранения в хранилище.');
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  return uploadBuffer({
    ...params,
    buffer,
    filename: params.filename,
  });
}

