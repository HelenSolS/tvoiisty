/**
 * QA B6 — Single video pointer per history item.
 * Backend-level check: re-animate overwrites existing video pointer on the same session.
 * Requires PostgreSQL. Skips if DB unavailable.
 */

import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../../backend/db.js';
import { ensureMediaTables } from '../../backend/media.js';
import { resolveOwnerMiddleware } from '../../backend/owner.js';
import { getHistoryHandler, reanimateHistoryItemHandler } from '../../backend/routes/tryon.js';
import { ensureTryonTables } from '../../backend/tryonSessions.js';

vi.mock('../../backend/kieClient.js', () => ({
  generateVideoFromImage: vi.fn().mockResolvedValue('https://provider.example.com/video.mp4'),
}));

vi.mock('../../backend/storage.js', () => ({
  mirrorFromUrl: vi.fn().mockResolvedValue({
    url: 'https://storage.example.com/tryon/video-latest.mp4',
    storageKey: 'media/tryon_result_video/latest.mp4',
  }),
}));

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
  app.post('/api/history/:id/reanimate', reanimateHistoryItemHandler);
  app.set('db', pool);
  return app;
}

const OWNER = 'client:video-pointer-owner';

async function insertCompletedSessionWithImageOnly(): Promise<string> {
  const assetRes = await pool.query(
    `INSERT INTO media_assets (type, original_url, storage_key, hash, mime_type)
     VALUES ('tryon_result_image', 'https://video-pointer-test/image.png', 'test/video-pointer-image', 'hash-' || gen_random_uuid(), 'image/png')
     RETURNING id`,
  );
  const imageAssetId = assetRes.rows[0].id;
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO tryon_sessions (id, owner_key, owner_type, status, result_image_asset_id, created_at, updated_at)
     VALUES ($1, $2, 'client', 'completed', $3, NOW(), NOW())`,
    [id, OWNER, imageAssetId],
  );
  return id;
}

async function countVideoAssetsForOwnerSession(sessionId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(DISTINCT ma.id) AS cnt
     FROM tryon_sessions ts
     JOIN media_assets ma ON ma.id = ts.result_video_asset_id
     WHERE ts.id = $1 AND ts.owner_key = $2`,
    [sessionId, OWNER],
  );
  return Number(res.rows[0]?.cnt ?? 0);
}

async function getHistoryVideoUrlsForOwner(headers: Record<string, string>): Promise<string[]> {
  const app = createApp();
  const res = await request(app).get('/api/history').set(headers);
  expect(res.status).toBe(200);
  const items = res.body as Array<{ sessionId: string; videoUrl?: string }>;
  return items.filter((x) => x.sessionId).map((x) => x.videoUrl || '');
}

describe('History single video pointer (QA B6)', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await ensureMediaTables();
    await ensureTryonTables();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://video-pointer-test/%'",
    );
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM tryon_sessions WHERE owner_key = $1', [OWNER]);
    await pool.query(
      "DELETE FROM media_assets WHERE original_url LIKE 'https://video-pointer-test/%'",
    );
  });

  it('re-animate overwrites video pointer for the same history session (backend)', async () => {
    if (!dbAvailable) return;

    const sessionId = await insertCompletedSessionWithImageOnly();
    const headers = { 'X-Client-Id': 'video-pointer-owner' };
    const app = createApp();

    const beforeCount = await countVideoAssetsForOwnerSession(sessionId);
    expect(beforeCount).toBe(0);

    await request(app).post(`/api/history/${sessionId}/reanimate`).set(headers).send({});
    await request(app).post(`/api/history/${sessionId}/reanimate`).set(headers).send({});

    const afterCount = await countVideoAssetsForOwnerSession(sessionId);
    expect(afterCount).toBe(1);

    const videoUrls = await getHistoryVideoUrlsForOwner(headers);
    expect(videoUrls.filter((u) => u)).toHaveLength(1);
    expect(videoUrls[0]).toBe('https://storage.example.com/tryon/video-latest.mp4');
  });
});

