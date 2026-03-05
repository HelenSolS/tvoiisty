// ISSUE 51 — Store Looks Persistence + Likes + Metrics
// NOTE: Backend implementation for looks and like API is not yet present in this repo.
// These tests describe expected behaviour and should be implemented once
// /api/looks and like/unlike endpoints are available.

import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../backend/db.js';
import {
  ensureLooksTables,
  incrementTryonCount,
} from '../../backend/looks.js';
import {
  getLooksHandler,
  likeLookHandler,
  unlikeLookHandler,
} from '../../backend/routes/looks.js';
import { ensureMediaTables } from '../../backend/media.js';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

function createApp() {
  const app = express();
  app.use(express.json());

  // Простая auth-заглушка: всегда аутентифицируем тестового пользователя.
  app.use((req, _res, next) => {
    (req as any).user = { id: TEST_USER_ID };
    next();
  });

  app.get('/api/looks', getLooksHandler);
  app.post('/api/looks/:id/like', likeLookHandler);
  app.delete('/api/looks/:id/like', unlikeLookHandler);

  return app;
}

async function createTestLook(params: {
  title?: string;
  likes?: number;
  tryons?: number;
}): Promise<string> {
  // Минимальный media_asset для main_asset_id
  const assetRes = await pool.query<{ id: string }>(
    `INSERT INTO media_assets (type, original_url, storage_key, hash)
     VALUES ('clothing', 'https://example.com/look.png', 'media/clothing/look.png', gen_random_uuid()::text)
     RETURNING id`,
  );
  const assetId = assetRes.rows[0].id;

  const lookRes = await pool.query<{ id: string }>(
    `INSERT INTO looks (store_id, title, description, main_asset_id, scene_type, is_active, likes_count, tryon_count)
     VALUES (gen_random_uuid(), $1, NULL, $2, NULL, TRUE, $3, $4)
     RETURNING id`,
    [params.title ?? 'Look', assetId, params.likes ?? 0, params.tryons ?? 0],
  );
  return lookRes.rows[0].id;
}

describe('Issue 51 — Store Looks API & Metrics', () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureMediaTables();
    await ensureLooksTables();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM user_liked_looks');
    await pool.query('DELETE FROM looks');
    await pool.query('DELETE FROM media_assets');
  });

  it('allows user to like a look (POST /api/looks/:id/like) and updates likes_count', async () => {
    const lookId = await createTestLook({ likes: 0 });

    await request(app).post(`/api/looks/${lookId}/like`).expect(204);

    const likedRes = await pool.query(
      'SELECT 1 FROM user_liked_looks WHERE user_id = $1 AND look_id = $2',
      [TEST_USER_ID, lookId],
    );
    expect(likedRes.rowCount).toBe(1);

    const looksRes = await pool.query<{ likes_count: number }>(
      'SELECT likes_count FROM looks WHERE id = $1',
      [lookId],
    );
    expect(looksRes.rows[0].likes_count).toBe(1);
  });

  it('allows user to unlike a look (DELETE /api/looks/:id/like) and decreases likes_count', async () => {
    const lookId = await createTestLook({ likes: 0 });

    await request(app).post(`/api/looks/${lookId}/like`).expect(204);
    await request(app).delete(`/api/looks/${lookId}/like`).expect(204);

    const likedRes = await pool.query(
      'SELECT 1 FROM user_liked_looks WHERE user_id = $1 AND look_id = $2',
      [TEST_USER_ID, lookId],
    );
    expect(likedRes.rowCount).toBe(0);

    const looksRes = await pool.query<{ likes_count: number }>(
      'SELECT likes_count FROM looks WHERE id = $1',
      [lookId],
    );
    expect(looksRes.rows[0].likes_count).toBe(0);
  });

  it('does not duplicate like when already liked and keeps likes_count stable', async () => {
    const lookId = await createTestLook({ likes: 0 });

    await request(app).post(`/api/looks/${lookId}/like`).expect(204);
    await request(app).post(`/api/looks/${lookId}/like`).expect(204);

    const likedRes = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM user_liked_looks WHERE user_id = $1 AND look_id = $2',
      [TEST_USER_ID, lookId],
    );
    expect(likedRes.rows[0].cnt).toBe(1);

    const looksRes = await pool.query<{ likes_count: number }>(
      'SELECT likes_count FROM looks WHERE id = $1',
      [lookId],
    );
    expect(looksRes.rows[0].likes_count).toBe(1);
  });

  it('increments tryon_count when incrementTryonCount is called (try-on metric)', async () => {
    const lookId = await createTestLook({ tryons: 0 });

    await incrementTryonCount(lookId);
    await incrementTryonCount(lookId);

    const looksRes = await pool.query<{ tryon_count: number }>(
      'SELECT tryon_count FROM looks WHERE id = $1',
      [lookId],
    );
    expect(looksRes.rows[0].tryon_count).toBe(2);
  });

  it('GET /api/looks supports sorting by likes_count DESC', async () => {
    await createTestLook({ title: 'A', likes: 5, tryons: 1 });
    await createTestLook({ title: 'B', likes: 10, tryons: 0 });
    await createTestLook({ title: 'C', likes: 1, tryons: 20 });

    const res = await request(app)
      .get('/api/looks')
      .query({ sort: 'likes' })
      .expect(200);

    const titles = (res.body.looks as Array<{ title: string }>).map(
      (l) => l.title,
    );
    expect(titles[0]).toBe('B'); // likes 10
  });

  it('GET /api/looks supports sorting by tryon_count DESC', async () => {
    await createTestLook({ title: 'A', likes: 5, tryons: 1 });
    await createTestLook({ title: 'B', likes: 10, tryons: 0 });
    await createTestLook({ title: 'C', likes: 1, tryons: 20 });

    const res = await request(app)
      .get('/api/looks')
      .query({ sort: 'tryons' })
      .expect(200);

    const titles = (res.body.looks as Array<{ title: string }>).map(
      (l) => l.title,
    );
    expect(titles[0]).toBe('C'); // tryon_count 20
  });

  it('GET /api/looks?liked=true returns only looks liked by current user and exposes popularity_score', async () => {
    const lookLiked = await createTestLook({ title: 'Liked', likes: 3, tryons: 2 });
    const lookNotLiked = await createTestLook({
      title: 'Not Liked',
      likes: 100,
      tryons: 0,
    });

    // Поставить лайк только одному look.
    await request(app).post(`/api/looks/${lookLiked}/like`).expect(204);
    void lookNotLiked;

    const res = await request(app)
      .get('/api/looks')
      .query({ liked: 'true', sort: 'likes' })
      .expect(200);

    const looks = res.body.looks as Array<{
      title: string;
      liked: boolean;
      popularity_score: number;
      likes_count: number;
      tryon_count: number;
    }>;

    expect(looks.length).toBe(1);
    expect(looks[0].title).toBe('Liked');
    expect(looks[0].liked).toBe(true);
    // popularity_score = likes_count * 2 + tryon_count
    expect(looks[0].popularity_score).toBe(
      looks[0].likes_count * 2 + looks[0].tryon_count,
    );
  });
});

