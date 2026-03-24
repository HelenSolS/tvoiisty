import { pool } from './db.js';
import type { MediaAsset } from './media.js';

export type TryonStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TryonSession {
  id: string;
  user_id: string | null;
  owner_type: string | null;
  owner_key: string | null;
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
  liked: boolean;
  viewed_at: Date | null;
}

export async function ensureTryonTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tryon_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      owner_type TEXT,
      owner_key TEXT,
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
      ,liked BOOLEAN NOT NULL DEFAULT FALSE
      ,viewed_at TIMESTAMPTZ
    )
  `);

  // Мягкая миграция для существующих БД.
  await pool.query(`ALTER TABLE tryon_sessions ADD COLUMN IF NOT EXISTS owner_type TEXT`);
  await pool.query(`ALTER TABLE tryon_sessions ADD COLUMN IF NOT EXISTS owner_key TEXT`);
  await pool.query(`ALTER TABLE tryon_sessions ADD COLUMN IF NOT EXISTS liked BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE tryon_sessions ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ`);
  await pool.query(`
    UPDATE tryon_sessions
    SET owner_type = COALESCE(owner_type, CASE WHEN user_id IS NOT NULL THEN 'user' ELSE 'client' END),
        owner_key = COALESCE(owner_key, CASE WHEN user_id IS NOT NULL THEN ('user:' || user_id::text) ELSE NULL END)
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tryon_user_created ON tryon_sessions(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tryon_owner_created ON tryon_sessions(owner_key, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tryon_look_created ON tryon_sessions(look_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tryon_status ON tryon_sessions(status)`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tryon_user_client_req ON tryon_sessions(user_id, client_request_id)`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tryon_owner_client_req ON tryon_sessions(owner_key, client_request_id) WHERE client_request_id IS NOT NULL`,
  );
}

export async function findTryonById(id: string): Promise<TryonSession | null> {
  const res = await pool.query<TryonSession>('SELECT * FROM tryon_sessions WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function findExistingTryonByClientRequest(
  ownerKey: string,
  clientRequestId: string,
): Promise<TryonSession | null> {
  if (!ownerKey) return null;
  const res = await pool.query<TryonSession>(
    'SELECT * FROM tryon_sessions WHERE owner_key = $1 AND client_request_id = $2 LIMIT 1',
    [ownerKey, clientRequestId],
  );
  return res.rows[0] ?? null;
}

export async function findActiveOwnerTryon(ownerKey: string): Promise<TryonSession | null> {
  if (!ownerKey) return null;
  const res = await pool.query<TryonSession>(
    `
    SELECT *
    FROM tryon_sessions
    WHERE owner_key = $1
      AND status IN ('pending', 'processing')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [ownerKey],
  );
  return res.rows[0] ?? null;
}

export async function listOwnerTryons(ownerKey: string, limit = 50): Promise<TryonSession[]> {
  const res = await pool.query<TryonSession>(
    `
    SELECT *
    FROM tryon_sessions
    WHERE owner_key = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [ownerKey, limit],
  );
  return res.rows;
}

export async function listUserTryons(userId: string, limit = 50): Promise<TryonSession[]> {
  return listOwnerTryons(`user:${userId}`, limit);
}

export async function createPendingTryon(params: {
  userId?: string | null;
  ownerType: 'user' | 'client';
  ownerKey: string;
  personAssetId?: string | null;
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
      owner_type,
      owner_key,
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11::jsonb, NOW())
    RETURNING *
    `,
    [
      params.userId ?? null,
      params.ownerType,
      params.ownerKey,
      params.personAssetId ?? null,
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

export async function trimCompletedOwnerTryons(ownerKey: string, limit = 50): Promise<void> {
  await pool.query(
    `
    DELETE FROM tryon_sessions
    WHERE owner_key = $1
      AND status = 'completed'
      AND id IN (
        SELECT id
        FROM tryon_sessions
        WHERE owner_key = $1
          AND status = 'completed'
        ORDER BY created_at DESC
        OFFSET $2
      )
    `,
    [ownerKey, limit],
  );
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

export async function setTryonLiked(ownerKey: string, sessionId: string, liked: boolean): Promise<void> {
  await pool.query(
    `
    UPDATE tryon_sessions
    SET liked = $3,
        updated_at = NOW()
    WHERE id = $1 AND owner_key = $2
    `,
    [sessionId, ownerKey, liked],
  );
}

export async function deleteOwnerTryon(ownerKey: string, sessionId: string): Promise<{
  deleted: boolean;
  removedAssets: Array<{ id: string; storageKey: string; originalUrl: string }>;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deletedSession = await client.query<{
      result_image_asset_id: string | null;
      result_video_asset_id: string | null;
    }>(
      `
      DELETE FROM tryon_sessions
      WHERE id = $1 AND owner_key = $2
      RETURNING result_image_asset_id, result_video_asset_id
      `,
      [sessionId, ownerKey],
    );

    if ((deletedSession.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { deleted: false, removedAssets: [] };
    }

    const row = deletedSession.rows[0];
    const assetIds = Array.from(
      new Set([row?.result_image_asset_id, row?.result_video_asset_id].filter(Boolean) as string[]),
    );

    let removedAssets: Array<{ id: string; storageKey: string; originalUrl: string }> = [];

    if (assetIds.length > 0) {
      const removable = await client.query<{
        id: string;
        storage_key: string;
        original_url: string;
      }>(
        `
        SELECT m.id, m.storage_key, m.original_url
        FROM media_assets m
        WHERE m.id = ANY($1::uuid[])
          AND NOT EXISTS (
            SELECT 1
            FROM tryon_sessions ts
            WHERE ts.person_asset_id = m.id
               OR ts.result_image_asset_id = m.id
               OR ts.result_video_asset_id = m.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM user_photos up
            WHERE up.asset_id = m.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM looks l
            WHERE l.main_asset_id = m.id
          )
        FOR UPDATE
        `,
        [assetIds],
      );

      if (removable.rows.length > 0) {
        const removableIds = removable.rows.map((x) => x.id);
        await client.query(`DELETE FROM media_assets WHERE id = ANY($1::uuid[])`, [removableIds]);
        removedAssets = removable.rows.map((x) => ({
          id: x.id,
          storageKey: x.storage_key,
          originalUrl: x.original_url,
        }));
      }
    }

    await client.query('COMMIT');
    return { deleted: true, removedAssets };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function markOwnerTryonsViewed(ownerKey: string, sessionIds: string[]): Promise<void> {
  if (!ownerKey || sessionIds.length === 0) return;
  await pool.query(
    `
    UPDATE tryon_sessions
    SET viewed_at = COALESCE(viewed_at, NOW()),
        updated_at = NOW()
    WHERE owner_key = $1
      AND id = ANY($2::uuid[])
    `,
    [ownerKey, sessionIds],
  );
}

export async function updateOwnerTryonVideoAsset(
  ownerKey: string,
  sessionId: string,
  videoAssetId: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE tryon_sessions
    SET result_video_asset_id = $3,
        updated_at = NOW()
    WHERE id = $1 AND owner_key = $2
    `,
    [sessionId, ownerKey, videoAssetId],
  );
}

