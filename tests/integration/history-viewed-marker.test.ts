/**
 * QA D10/D11 — New/viewed history markers at API level:
 * - New session has isNew: true (no viewed_at).
 * - After POST /api/history/viewed with that session id, GET /api/history returns isNew: false.
 * Requires PostgreSQL. Skips if DB unavailable.
 */

import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../backend/db.js';
import { ensureMediaTables } from '../../backend/media.js';
import { resolveOwnerMiddleware } from '../../backend/owner.js';
import {
  getHistoryHandler,
  markHistoryViewedHandler,
} from '../../backend/routes/tryon.js';
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
  app.post('/api/history/viewed', markHistoryViewedHandler);
  app.set('db', pool);
  return app;
}

const OWNER = 'client:viewed-marker-owner';

async function insertCompletedSession(sessionId?: string): Promise<string> {
  const assetRes = await pool.query(
    `INSERT INTO media_assets (type, original_url, storage_key, hash, mime_type)
     VALUES ('tryon_result_image', 'https://viewed-test/1.png', 'test/viewed', 'hash-' || gen_random_uuid(), 'image/png')
     RETURNING id`,
  );
  const assetId = assetRes.rows[0].id;
  const id = sessionId ?? crypto.randomUUID();
  await pool.query(
    `INSERT INTO tryon_sessions (id, owner_key, owner_type, status, result_image_asset_id, created_at, updated_at, viewed_at)
     VALUES ($1, $2, 'client', 'completed', $3, NOW(), NOW(), NULL)`,
    [id, OWNER, assetId],
  );
  return id;
}

describe('History new/viewed markers (QA D10/D11)', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await ensureMediaTables();
    await ensureTryonTables();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://viewed-test/%'",
    );
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://viewed-test/%'",
    );
  });

  it('GET /api/history returns isNew: true for session without viewed_at; after POST /api/history/viewed returns isNew: false', async () => {
    if (!dbAvailable) return;

    const sessionId = await insertCompletedSession();
    const app = createApp();
    const headers = { 'X-Client-Id': 'viewed-marker-owner' };

    const before = await request(app).get('/api/history').set(headers);
    expect(before.status).toBe(200);
    const itemsBefore = before.body as Array<{ sessionId: string; isNew?: boolean }>;
    const item = itemsBefore.find((x) => x.sessionId === sessionId);
    expect(item).toBeDefined();
    expect(item!.isNew).toBe(true);

    await request(app)
      .post('/api/history/viewed')
      .set(headers)
      .send({ ids: [sessionId] });

    const after = await request(app).get('/api/history').set(headers);
    expect(after.status).toBe(200);
    const itemsAfter = after.body as Array<{ sessionId: string; isNew?: boolean }>;
    const itemAfter = itemsAfter.find((x) => x.sessionId === sessionId);
    expect(itemAfter).toBeDefined();
    expect(itemAfter!.isNew).toBe(false);
  });
});
