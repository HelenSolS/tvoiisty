/**
 * QA B5 — History limit = 50: list returns at most 50 items per owner.
 * Requires PostgreSQL. Skips if DB unavailable.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../backend/db.js';
import { ensureMediaTables } from '../../backend/media.js';
import { resolveOwnerMiddleware } from '../../backend/owner.js';
import { getHistoryHandler } from '../../backend/routes/tryon.js';
import { ensureTryonTables } from '../../backend/tryonSessions.js';

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
  app.get('/api/history', getHistoryHandler);
  app.set('db', pool);
  return app;
}

const OWNER = 'client:limit-test-owner';

async function insertCompletedSession(index: number) {
  const assetRes = await pool.query(
    `INSERT INTO media_assets (type, original_url, storage_key, hash, mime_type)
     VALUES ('tryon_result_image', $1, 'test/limit-' || $2, 'hash-' || gen_random_uuid(), 'image/png')
     RETURNING id`,
    [`https://limit-test/${index}.png`, index],
  );
  const assetId = assetRes.rows[0].id;
  await pool.query(
    `INSERT INTO tryon_sessions (owner_key, owner_type, status, result_image_asset_id, created_at, updated_at)
     VALUES ($1, 'client', 'completed', $2, NOW(), NOW())`,
    [OWNER, assetId],
  );
}

describe('History limit 50 (QA B5)', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await ensureMediaTables();
    await ensureTryonTables();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://limit-test/%'",
    );
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://limit-test/%'",
    );
  });

  it('GET /api/history returns at most 50 items when owner has more than 50 completed sessions', async () => {
    if (!dbAvailable) return;

    for (let i = 0; i < 52; i++) {
      await insertCompletedSession(i);
    }

    const app = createApp();
    const res = await request(app)
      .get('/api/history')
      .set('X-Client-Id', 'limit-test-owner');

    expect(res.status).toBe(200);
    const items = res.body as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(50);
    expect(items.length).toBe(50);
  });
});
