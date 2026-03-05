import crypto from 'crypto';
import type { Request, Response } from 'express';
import { put } from '@vercel/blob';
import type { MediaType } from '../media.js';
import { findOrCreateAssetByHash } from '../media.js';
import { enqueuePhotoAnalysis } from '../aiPhotoPipeline.js';

const ALLOWED_TYPES: MediaType[] = ['person', 'clothing', 'location'];

export async function uploadMediaHandler(req: Request, res: Response): Promise<void> {
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

  const type = typeRaw as MediaType;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[uploadMedia] BLOB_READ_WRITE_TOKEN not set');
    res
      .status(503)
      .json({ error: 'Хранилище временно недоступно. Попробуйте позже.' });
    return;
  }

  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

  try {
    const blob = await put(
      `media/${type}/${Date.now()}-${file.originalname}`,
      file.buffer,
      { access: 'public' },
    );

    const url = blob.url;
    const storageKey = new URL(blob.url).pathname.replace(/^\//, '');

    const asset = await findOrCreateAssetByHash({
      type,
      hash,
      originalUrl: url,
      storageKey,
      mimeType: file.mimetype,
    });

    // Асинхронный LLM-пайплайн: модерация + описание + метаданные.
    enqueuePhotoAnalysis({
      assetId: asset.id,
      type,
      analysisType: 'photo_llm_v1',
    });

    res.status(201).json({
      assetId: asset.id,
      type: asset.type,
      url: asset.original_url,
      hash: asset.hash,
    });
  } catch (err) {
    console.error('[uploadMedia] failed', err);
    res
      .status(502)
      .json({ error: 'Не удалось сохранить изображение. Попробуйте позже.' });
  }
}

