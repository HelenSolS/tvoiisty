import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { MediaType } from '../media.js';
import { isProbablyImageUpload } from '../fileValidation.js';
import { findAssetByHash, findOrCreateAssetByHash } from '../media.js';
import { enqueuePhotoAnalysis } from '../aiPhotoPipeline.js';
import { uploadBuffer } from '../storage.js';
import { trimUserPhotos, upsertUserPhoto } from '../userPhotos.js';

const ALLOWED_TYPES: MediaType[] = ['person', 'clothing', 'location'];

export async function uploadMediaHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerKey?: string } }).owner;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const typeRaw = (req.body?.type as string | undefined) ?? 'person';

  if (!file) {
    res.status(400).json({ error: 'Файл не передан.' });
    return;
  }

  if (!ALLOWED_TYPES.includes(typeRaw as MediaType)) {
    res.status(400).json({ error: 'Некорректный тип изображения.' });
    return;
  }

  if (!isProbablyImageUpload(file)) {
    res.status(415).json({ error: 'Поддерживаются только изображения (jpg/png/webp/heic/heif/avif).' });
    return;
  }

  const type = typeRaw as MediaType;

  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

  try {
    // Сначала проверяем по hash: тот же файл уже загружен — возвращаем существующий asset без дублирования в storage и без нарушения UNIQUE(hash, type).
    const existing = await findAssetByHash(type, hash);
    if (existing) {
      res.status(201).json({
        assetId: existing.id,
        type: existing.type,
        url: existing.original_url,
        hash: existing.hash,
      });
      return;
    }

    const stored = await uploadBuffer({
      type,
      buffer: file.buffer,
      filename: file.originalname,
    });

    const asset = await findOrCreateAssetByHash({
      type,
      hash,
      originalUrl: stored.url,
      storageKey: stored.storageKey,
      mimeType: file.mimetype,
    });

    // Асинхронный LLM-пайплайн: модерация + описание + метаданные.
    // Ошибка фонового анализа не должна ломать загрузку файла.
    try {
      enqueuePhotoAnalysis({
        assetId: asset.id,
        type,
        analysisType: 'photo_llm_v1',
      });
    } catch (analysisErr) {
      console.warn('[uploadMedia] enqueuePhotoAnalysis failed', analysisErr);
    }

    // Для "Моих фото" ведём отдельный список владельца с лимитом 10.
    if (type === 'person' && owner?.ownerKey) {
      // Если таблица user_photos временно недоступна, не роняем upload.
      try {
        await upsertUserPhoto(owner.ownerKey, asset.id);
        await trimUserPhotos(owner.ownerKey, 10);
      } catch (photosErr) {
        console.warn('[uploadMedia] user_photos write failed', photosErr);
      }
    }

    res.status(201).json({
      assetId: asset.id,
      type: asset.type,
      url: asset.original_url,
      hash: asset.hash,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[uploadMedia] failed', err);
    if (msg.includes('BLOB_READ_WRITE_TOKEN') || msg.includes('Хранилище временно недоступно')) {
      res.status(503).json({
        error: 'Хранилище не настроено. На сервере в .env должен быть BLOB_READ_WRITE_TOKEN (Vercel Blob) или SUPABASE_URL + SUPABASE_SERVICE_KEY.',
      });
      return;
    }
    if (msg.includes('Не удалось сохранить файл') || msg.includes('supabase')) {
      res.status(503).json({ error: 'Ошибка хранилища (Supabase). Проверьте SUPABASE_* в .env на сервере.' });
      return;
    }
    res.status(502).json({ error: msg || 'Не удалось сохранить изображение. Попробуйте позже.' });
  }
}

