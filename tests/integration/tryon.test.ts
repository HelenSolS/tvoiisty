// Issue 40 — Try-On Engine: API + sessions + metrics

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { pool } from '../../backend/db.js';
import { ensureMediaTables } from '../../backend/media.js';
import { ensureLooksTables, incrementTryonCount } from '../../backend/looks.js';
import {
  ensureTryonTables,
  listUserTryons,
} from '../../backend/tryonSessions.js';
import { ensureTokenTables } from '../../backend/tokens.js';
import {
  createTryonHandler,
  getTryonStatusHandler,
  listMyTryonsHandler,
} from '../../backend/routes/tryon.js';
import { requireAuth } from '../../backend/auth.js';

const JWT_SECRET = 'test-secret-tryon';
process.env.JWT_SECRET = JWT_SECRET;

// Mocks: KIE client + token logging + image asset creation.
const generateImageTryOnMock = vi.fn().mockResolvedValue('https://cdn.example.com/tryon-result.png');
const createMediaAssetMock = vi.fn().mockResolvedValue({
  id: 'result-asset-id',
  type: 'tryon_result_image',
  original_url: 'https://cdn.example.com/tryon-result.png',
  storage_key: 'tryon/result.png',
  hash: 'hash-result',
  mime_type: 'image/png',
  created_at: new Date(),
});
const incrementTryonCountMock = vi.fn();
const logTryonTokenChargeMock = vi.fn();

vi.mock('../../backend/kieClient.js', async (orig) => {
  const actual = await orig<typeof import('../../backend/kieClient.js')>();
  return {
    ...actual,
    generateImageTryOn: generateImageTryOnMock,
  };
});

vi.mock('../../backend/media.js', async (orig) => {
  const actual = await orig<typeof import('../../backend/media.js')>();
  return {
    ...actual,
    createMediaAsset: createMediaAssetMock,
  };
});

vi.mock('../../backend/looks.js', async (orig) => {
  const actual = await orig<typeof import('../../backend/looks.js')>();
  return {
    ...actual,
    incrementTryonCount: incrementTryonCountMock,
  };
});

vi.mock('../../backend/tokens.js', async (orig) => {
  const actual = await orig<typeof import('../../backend/tokens.js')>();
  return {
    ...actual,
    logTryonTokenCharge: logTryonTokenChargeMock,
  };
});

function createToken(userId: string) {
  return jwt.sign(
    {
      id: userId,
      email: 'user@example.com',
      global_role: 'client',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.set('db', pool);

  app.post('/api/tryon', requireAuth, createTryonHandler);
  app.get('/api/tryon/:id', requireAuth, getTryonStatusHandler);
  app.get('/api/my/tryons', requireAuth, listMyTryonsHandler);

  return app;
}

async function createPersonAsset(): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO media_assets (type, original_url, storage_key, hash)
     VALUES ('person', 'https://images.example.com/person.png', 'media/person.png', gen_random_uuid()::text)
     RETURNING id`,
  );
  return res.rows[0].id;
}

async function createLookWithAsset(): Promise<string> {
  const assetRes = await pool.query<{ id: string }>(
    `INSERT INTO media_assets (type, original_url, storage_key, hash)
     VALUES ('clothing', 'https://images.example.com/look.png', 'media/look.png', gen_random_uuid()::text)
     RETURNING id`,
  );
  const assetId = assetRes.rows[0].id;

  const lookRes = await pool.query<{ id: string }>(
    `INSERT INTO looks (store_id, title, description, main_asset_id, scene_type, is_active, likes_count, tryon_count)
     VALUES (gen_random_uuid(), 'Test Look', NULL, $1, NULL, TRUE, 0, 0)
     RETURNING id`,
    [assetId],
  );
  return lookRes.rows[0].id;
}

describe('Issue 40 — Try-On Engine API', () => {
  const app = createApp();
  const userId = '00000000-0000-0000-0000-000000000010';
  const authHeader = `Bearer ${createToken(userId)}`;

  beforeAll(async () => {
    await ensureMediaTables();
    await ensureLooksTables();
    await ensureTryonTables();
    await ensureTokenTables();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM token_transactions');
    await pool.query('DELETE FROM tryon_sessions');
    await pool.query('DELETE FROM media_assets');
    await pool.query('DELETE FROM looks');
    vi.clearAllMocks();
  });

  it('POST /api/tryon returns 401 without auth', async () => {
    await request(app).post('/api/tryon').send({}).expect(401);
  });

  it('POST /api/tryon returns 400 when person_asset_id or look_id is missing', async () => {
    const res = await request(app)
      .post('/api/tryon')
      .set('Authorization', authHeader)
      .send({ person_asset_id: 'x' })
      .expect(400);

    expect(res.body.error).toMatch(/person_asset_id и look_id/i);
  });

  it('creates pending tryon session and is idempotent by client_request_id', async () => {
    const personAssetId = await createPersonAsset();
    const lookId = await createLookWithAsset();

    const clientRequestId = 'req-123';

    const first = await request(app)
      .post('/api/tryon')
      .set('Authorization', authHeader)
      .send({
        person_asset_id: personAssetId,
        look_id: lookId,
        client_request_id: clientRequestId,
      })
      .expect(201);

    const second = await request(app)
      .post('/api/tryon')
      .set('Authorization', authHeader)
      .send({
        person_asset_id: personAssetId,
        look_id: lookId,
        client_request_id: clientRequestId,
      })
      .expect(200);

    expect(first.body.tryon_id).toBeDefined();
    expect(second.body.tryon_id).toBe(first.body.tryon_id);

    const dbRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM tryon_sessions');
    expect(dbRes.rows[0].cnt).toBe(1);
  });

  it('background job completes tryon, creates result asset, increments metrics and logs tokens', async () => {
    const personAssetId = await createPersonAsset();
    const lookId = await createLookWithAsset();

    // Mock global fetch: first two calls return person/cloth image bytes, third returns result image bytes.
    const fetchMock = vi.fn();
    // person image
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => Buffer.from('person-bytes'),
    } as any);
    // clothing image
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => Buffer.from('clothing-bytes'),
    } as any);
    // result image download
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => Buffer.from('result-image-bytes'),
    } as any);

    // @ts-expect-error override global fetch in test env
    global.fetch = fetchMock;

    const createRes = await request(app)
      .post('/api/tryon')
      .set('Authorization', authHeader)
      .send({
        person_asset_id: personAssetId,
        look_id: lookId,
      })
      .expect(201);

    const tryonId = createRes.body.tryon_id as string;

    // Дать фоновому воркеру немного времени на выполнение.
    await new Promise((r) => setTimeout(r, 50));

    const sessionRes = await pool.query<{
      status: string;
      result_image_asset_id: string | null;
      tokens_charged: number;
    }>('SELECT status, result_image_asset_id, tokens_charged FROM tryon_sessions WHERE id = $1', [
      tryonId,
    ]);

    expect(sessionRes.rows[0].status).toBe('completed');
    expect(sessionRes.rows[0].result_image_asset_id).toBe('result-asset-id');
    expect(sessionRes.rows[0].tokens_charged).toBe(1);

    expect(createMediaAssetMock).toHaveBeenCalledTimes(1);
    expect(incrementTryonCountMock).toHaveBeenCalledTimes(1);
    expect(logTryonTokenChargeMock).toHaveBeenCalledTimes(1);

    const tokenTx = await pool.query(
      'SELECT amount FROM token_transactions WHERE tryon_session_id = $1',
      [tryonId],
    );
    expect(tokenTx.rows[0].amount).toBe(1);
  });

  it('GET /api/tryon/:id enforces auth and ownership', async () => {
    // Unauthenticated
    await request(app).get('/api/tryon/some-id').expect(401);

    // Create a session for other user.
    const otherUserId = '00000000-0000-0000-0000-000000000099';
    const personAssetId = await createPersonAsset();
    const lookId = await createLookWithAsset();
    const sessionRes = await pool.query<{ id: string }>(
      `INSERT INTO tryon_sessions (user_id, person_asset_id, look_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [otherUserId, personAssetId, lookId],
    );
    const foreignId = sessionRes.rows[0].id;

    const res404 = await request(app)
      .get(`/api/tryon/${foreignId}`)
      .set('Authorization', authHeader)
      .expect(404);
    expect(res404.body.error).toMatch(/не найдена/i);
  });

  it('GET /api/tryon/:id returns status, image_url and error fields', async () => {
    const personAssetId = await createPersonAsset();
    const lookId = await createLookWithAsset();

    const assetRes = await pool.query<{ id: string }>(
      `INSERT INTO media_assets (type, original_url, storage_key, hash)
       VALUES ('tryon_result_image', 'https://cdn.example.com/existing.png', 'tryon/existing.png', gen_random_uuid()::text)
       RETURNING id`,
    );
    const resultAssetId = assetRes.rows[0].id;

    const sessionRes = await pool.query<{ id: string }>(
      `INSERT INTO tryon_sessions (user_id, person_asset_id, look_id, status, result_image_asset_id, error_message)
       VALUES ($1, $2, $3, 'completed', $4, NULL)
       RETURNING id`,
      [userId, personAssetId, lookId, resultAssetId],
    );
    const tryonId = sessionRes.rows[0].id;

    const resGet = await request(app)
      .get(`/api/tryon/${tryonId}`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(resGet.body.status).toBe('completed');
    expect(resGet.body.image_url).toBe('https://cdn.example.com/existing.png');
    expect(resGet.body.error).toBeNull();
  });

  it('GET /api/my/tryons returns up to 50 sessions with enriched fields', async () => {
    const personAssetId = await createPersonAsset();
    const lookId = await createLookWithAsset();

    const completedRes = await pool.query<{ id: string }>(
      `INSERT INTO media_assets (type, original_url, storage_key, hash)
       VALUES ('tryon_result_image', 'https://cdn.example.com/history.png', 'tryon/history.png', gen_random_uuid()::text)
       RETURNING id`,
    );
    const resultAssetId = completedRes.rows[0].id;

    await pool.query(
      `INSERT INTO tryon_sessions (user_id, person_asset_id, look_id, status, result_image_asset_id, created_at)
       VALUES ($1, $2, $3, 'completed', $4, NOW())`,
      [userId, personAssetId, lookId, resultAssetId],
    );

    const resList = await request(app)
      .get('/api/my/tryons')
      .set('Authorization', authHeader)
      .expect(200);

    const tryons = resList.body.tryons as Array<{
      tryon_id: string;
      look_id: string;
      person_asset_id: string;
      image_url: string | null;
      look_title: string | null;
    }>;

    expect(tryons.length).toBeGreaterThan(0);
    expect(tryons[0].image_url).toBe('https://cdn.example.com/history.png');
    expect(tryons[0].look_title).toBe('Test Look');

    const direct = await listUserTryons(userId);
    expect(direct.length).toBe(tryons.length);
  });
});

