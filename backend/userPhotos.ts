import { pool } from './db.js';

export interface UserPhotoRow {
  id: string;
  owner_key: string;
  asset_id: string;
  created_at: Date;
}

export async function ensureUserPhotosTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_key TEXT NOT NULL,
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_photos_owner_asset_idx
      ON user_photos(owner_key, asset_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_photos_owner_created_idx
      ON user_photos(owner_key, created_at DESC)
  `);
}

export async function upsertUserPhoto(ownerKey: string, assetId: string): Promise<void> {
  await pool.query(
    `
    INSERT INTO user_photos (owner_key, asset_id)
    VALUES ($1, $2)
    ON CONFLICT (owner_key, asset_id)
    DO UPDATE SET created_at = NOW()
    `,
    [ownerKey, assetId],
  );
}

export async function trimUserPhotos(ownerKey: string, limit = 10): Promise<void> {
  await pool.query(
    `
    DELETE FROM user_photos
    WHERE owner_key = $1
      AND id IN (
        SELECT id
        FROM user_photos
        WHERE owner_key = $1
        ORDER BY created_at DESC
        OFFSET $2
      )
    `,
    [ownerKey, limit],
  );
}

export async function listUserPhotos(ownerKey: string, limit = 10): Promise<Array<{ id: string; url: string; createdAt: string }>> {
  const res = await pool.query<{ id: string; created_at: Date; url: string }>(
    `
    SELECT up.id, up.created_at, ma.original_url AS url
    FROM user_photos up
    JOIN media_assets ma ON ma.id = up.asset_id
    WHERE up.owner_key = $1
    ORDER BY up.created_at DESC
    LIMIT $2
    `,
    [ownerKey, limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    url: r.url,
    createdAt: r.created_at.toISOString(),
  }));
}

