import { pool } from './db.js';
import type { MediaAsset } from './media.js';

export type TryonStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TryonSession {
  id: string;
  user_id: string | null;
  person_asset_id: string | null;
  look_id: string | null;
  result_image_asset_id: string | null;
  result_video_asset_id: string | null;
  provider: string | null;
  model_name: string | null;
  scene_type: string | null;
  status: TryonStatus;
  error_message: string | null;
  client_request_id: string | null;
  tokens_charged: number;
  source: string | null;
  request_meta: unknown | null;
  result_meta: unknown | null;
  requested_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function ensureTryonTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tryon_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      person_asset_id UUID REFERENCES media_assets(id),
      look_id UUID REFERENCES looks(id),
      result_image_asset_id UUID REFERENCES media_assets(id),
      result_video_asset_id UUID REFERENCES media_assets(id),
      provider TEXT,
      model_name TEXT,
      scene_type TEXT,
      status TEXT CHECK (status IN ('pending','processing','completed','failed','cancelled')) NOT NULL DEFAULT 'pending',
      error_message TEXT,
      client_request_id TEXT,
      tokens_charged INT DEFAULT 0,
      source TEXT,
      request_meta JSONB,
      result_meta JSONB,
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tryon_user_created ON tryon_sessions(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tryon_look_created ON tryon_sessions(look_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tryon_status ON tryon_sessions(status)`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tryon_user_client_req ON tryon_sessions(user_id, client_request_id)`,
  );
}

export async function findTryonById(id: string): Promise<TryonSession | null> {
  const res = await pool.query<TryonSession>('SELECT * FROM tryon_sessions WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function findExistingTryonByClientRequest(
  userId: string | null,
  clientRequestId: string,
): Promise<TryonSession | null> {
  if (!userId) return null;
  const res = await pool.query<TryonSession>(
    'SELECT * FROM tryon_sessions WHERE user_id = $1 AND client_request_id = $2 LIMIT 1',
    [userId, clientRequestId],
  );
  return res.rows[0] ?? null;
}

export async function listUserTryons(userId: string, limit = 50): Promise<TryonSession[]> {
  const res = await pool.query<TryonSession>(
    `
    SELECT *
    FROM tryon_sessions
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, limit],
  );
  return res.rows;
}

export async function createPendingTryon(params: {
  userId?: string | null;
  personAssetId: string;
  lookId: string | null;
  sceneType?: string;
  provider?: string;
  modelName?: string;
  clientRequestId?: string;
  source?: string;
  requestMeta?: unknown;
}): Promise<TryonSession> {
  const res = await pool.query<TryonSession>(
    `
    INSERT INTO tryon_sessions (
      user_id,
      person_asset_id,
      look_id,
      scene_type,
      provider,
      model_name,
      status,
      client_request_id,
      source,
      request_meta,
      requested_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9::jsonb, NOW())
    RETURNING *
    `,
    [
      params.userId ?? null,
      params.personAssetId,
      params.lookId,
      params.sceneType ?? null,
      params.provider ?? null,
      params.modelName ?? null,
      params.clientRequestId ?? null,
      params.source ?? 'web',
      params.requestMeta ? JSON.stringify(params.requestMeta) : null,
    ],
  );
  return res.rows[0];
}

export async function markTryonProcessing(id: string): Promise<void> {
  await pool.query(
    `
    UPDATE tryon_sessions
    SET status = 'processing',
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [id],
  );
}

export async function markTryonCompleted(params: {
  id: string;
  resultImageAsset: MediaAsset;
  tokensCharged: number;
  resultMeta?: unknown;
}): Promise<void> {
  await pool.query(
    `
    UPDATE tryon_sessions
    SET status = 'completed',
        result_image_asset_id = $2,
        tokens_charged = $3,
        result_meta = $4::jsonb,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [
      params.id,
      params.resultImageAsset.id,
      params.tokensCharged,
      params.resultMeta ? JSON.stringify(params.resultMeta) : null,
    ],
  );
}

/** Завершить примерку с URL картинки от провайдера (Fal/KIE), когда mirror в наше хранилище не удался — пользователь всё равно получает картинку. URL провайдера может иметь ограниченный TTL; основной источник — mirror в storage. */
export async function markTryonCompletedWithImageUrl(params: {
  id: string;
  imageUrl: string;
  tokensCharged?: number;
}): Promise<void> {
  await pool.query(
    `
    UPDATE tryon_sessions
    SET status = 'completed',
        result_meta = $2::jsonb,
        tokens_charged = COALESCE($3, 0),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [params.id, JSON.stringify({ image_url: params.imageUrl }), params.tokensCharged ?? 0],
  );
}

export async function markTryonFailed(id: string, errorMessage: string): Promise<void> {
  await pool.query(
    `
    UPDATE tryon_sessions
    SET status = 'failed',
        error_message = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [id, errorMessage],
  );
}

