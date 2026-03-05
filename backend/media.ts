import { pool } from './db.js';

export type MediaType =
  | 'person'
  | 'clothing'
  | 'location'
  // Результаты примерок и анимаций тоже попадают в media_assets,
  // но не проходят LLM-пайплайн анализа.
  | 'tryon_result_image'
  | 'tryon_result_video';

export interface MediaAsset {
  id: string;
  type: MediaType;
  original_url: string;
  storage_key: string;
  hash: string;
  mime_type: string | null;
  created_at: Date;
}

export async function ensureMediaTables(): Promise<void> {
  // media_assets: единый реестр всех загруженных изображений
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      original_url TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      hash TEXT NOT NULL,
      mime_type TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS media_assets_hash_type_idx
      ON media_assets(hash, type)
  `);

  // ai_analyses: результаты LLM-пайплайна (модерация, описание, метаданные)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_analyses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      analysis_type TEXT NOT NULL,
      status TEXT NOT NULL,
      result JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ai_analyses_asset_type_idx
      ON ai_analyses(asset_id, analysis_type)
  `);
}

export async function findAssetByHash(
  type: MediaType,
  hash: string,
): Promise<MediaAsset | null> {
  const res = await pool.query<MediaAsset>(
    'SELECT * FROM media_assets WHERE type = $1 AND hash = $2 LIMIT 1',
    [type, hash],
  );
  return res.rows[0] ?? null;
}

export async function createMediaAsset(params: {
  type: MediaType;
  originalUrl: string;
  storageKey: string;
  hash: string;
  mimeType?: string;
}): Promise<MediaAsset> {
  const res = await pool.query<MediaAsset>(
    `
    INSERT INTO media_assets (type, original_url, storage_key, hash, mime_type)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      params.type,
      params.originalUrl,
      params.storageKey,
      params.hash,
      params.mimeType ?? null,
    ],
  );
  return res.rows[0];
}

/**
 * Возвращает существующий asset по (hash, type) или создаёт новый.
 * Это реализует стратегию:
 *   - image hash предотвращает повторный AI-анализ одинаковых картинок
 *   - повторные загрузки с тем же hash переиспользуют media_assets + ai_analyses
 */
export async function findOrCreateAssetByHash(params: {
  type: MediaType;
  hash: string;
  originalUrl: string;
  storageKey: string;
  mimeType?: string;
}): Promise<MediaAsset> {
  const existing = await findAssetByHash(params.type, params.hash);
  if (existing) return existing;

  try {
    return await createMediaAsset(params);
  } catch (err) {
    // На случай гонки по UNIQUE(hash, type) повторно читаем.
    const fallback = await findAssetByHash(params.type, params.hash);
    if (fallback) return fallback;
    throw err;
  }
}

