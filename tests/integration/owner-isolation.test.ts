/**
 * QA A3 — Owner and data isolation: different X-Client-Id see only their own history.
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

async function insertCompletedSession(ownerKey: string, imageUrl: string) {
  const assetRes = await pool.query(
    `INSERT INTO media_assets (type, original_url, storage_key, hash, mime_type)
     VALUES ('tryon_result_image', $1, 'test/key', 'hash-' || gen_random_uuid(), 'image/png')
     RETURNING id`,
    [imageUrl],
  );
  const assetId = assetRes.rows[0].id;
  await pool.query(
    `INSERT INTO tryon_sessions (owner_key, owner_type, status, result_image_asset_id, created_at, updated_at)
     VALUES ($1, 'client', 'completed', $2, NOW(), NOW())`,
    [ownerKey, assetId],
  );
}

describe('Owner isolation (QA A3)', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await ensureMediaTables();
    await ensureTryonTables();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key LIKE $1', ['client:iso-%']);
    await pool.query(
      'DELETE FROM media_assets WHERE original_url LIKE $1',
      ['https://iso-test/%'],
    );
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key LIKE $1', ['client:iso-%']);
    await pool.query(
      'DELETE FROM media_assets WHERE original_url LIKE $1',
      ['https://iso-test/%'],
    );
  });

  it('GET /api/history returns only sessions for the requesting owner', async () => {
    if (!dbAvailable) return;

    await insertCompletedSession('client:iso-alpha', 'https://iso-test/alpha1.png');
    await insertCompletedSession('client:iso-alpha', 'https://iso-test/alpha2.png');
    await insertCompletedSession('client:iso-bravo', 'https://iso-test/bravo1.png');

    const app = createApp();

    const resAlpha = await request(app)
      .get('/api/history')
      .set('X-Client-Id', 'iso-alpha');
    const resBravo = await request(app)
      .get('/api/history')
      .set('X-Client-Id', 'iso-bravo');

    expect(resAlpha.status).toBe(200);
    expect(resBravo.status).toBe(200);

    const historyAlpha = resAlpha.body as unknown[];
    const historyBravo = resBravo.body as unknown[];

    expect(Array.isArray(historyAlpha)).toBe(true);
    expect(Array.isArray(historyBravo)).toBe(true);
    expect(historyAlpha).toHaveLength(2);
    expect(historyBravo).toHaveLength(1);
  });
});
