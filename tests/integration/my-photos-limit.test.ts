/**
 * QA B4 — My Photos limit = 10: list returns at most 10 items per owner.
 * Requires PostgreSQL. Skips if DB unavailable.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../backend/db.js';
import { ensureMediaTables } from '../../backend/media.js';
import { resolveOwnerMiddleware } from '../../backend/owner.js';
import { getMyPhotosHandler } from '../../backend/routes/myPhotos.js';
import { ensureUserPhotosTable } from '../../backend/userPhotos.js';

const dbAvailable = await (async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
})();

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(resolveOwnerMiddleware);
  app.get('/api/my/photos', getMyPhotosHandler);
  app.set('db', pool);
  return app;
}

const OWNER = 'client:photos-limit-owner';

async function insertUserPhoto(index: number) {
  const assetRes = await pool.query(
    `INSERT INTO media_assets (type, original_url, storage_key, hash, mime_type)
     VALUES ('person', $1, 'test/photos-' || $2, 'hash-photos-' || gen_random_uuid(), 'image/png')
     RETURNING id`,
    [`https://photos-limit-test/${index}.png`, index],
  );
  const assetId = assetRes.rows[0].id;
  await pool.query(
    `INSERT INTO user_photos (owner_key, asset_id) VALUES ($1, $2)`,
    [OWNER, assetId],
  );
}

describe('My Photos limit 10 (QA B4)', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await ensureMediaTables();
    await ensureUserPhotosTable();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM user_photos WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://photos-limit-test/%'",
    );
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM user_photos WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://photos-limit-test/%'",
    );
  });

  it('GET /api/my/photos returns at most 10 items when owner has more than 10 photos', async () => {
    if (!dbAvailable) return;

    for (let i = 0; i < 11; i++) {
      await insertUserPhoto(i);
    }

    const app = createApp();
    const res = await request(app)
      .get('/api/my/photos')
      .set('X-Client-Id', 'photos-limit-owner');

    expect(res.status).toBe(200);
    const items = res.body as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(10);
    expect(items.length).toBe(10);
  });
});
