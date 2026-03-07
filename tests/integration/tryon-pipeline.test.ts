/**
 * ISSUE 5 — Проверка цепочки upload → tryon → result.
 * Ожидаемое: HTTP 200 и image_url в ответе GET /api/tryon/:id при status completed.
 *
 * Требуется запущенный PostgreSQL. Если БД недоступна, сьют пропускается (без падения).
 */

import express from 'express';
import multer from 'multer';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../../backend/db.js';
import { ensureMediaTables } from '../../backend/media.js';
import { ensureUsersTable } from '../../backend/users.js';
import { ensureTryonTables } from '../../backend/tryonSessions.js';
import {
  createTryonHandler,
  getTryonStatusHandler,
} from '../../backend/routes/tryon.js';
import { uploadMediaHandler } from '../../backend/routes/uploadMedia.js';

const dbAvailable = await (async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
})();

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

vi.mock('../../backend/storage.js', () => ({
  uploadBuffer: vi.fn().mockResolvedValue({
    url: 'https://test-storage.example.com/media/person/test.png',
    storageKey: 'media/person/test.png',
  }),
  mirrorFromUrl: vi.fn().mockResolvedValue({
    url: 'https://test-storage.example.com/media/result.png',
    storageKey: 'media/tryon_result_image/result.png',
  }),
}));

vi.mock('../../backend/services/tryonEngine.js', () => ({
  execute: vi.fn().mockResolvedValue({
    success: true,
    imageUrl: 'https://provider-fake/out.png',
  }),
}));

vi.mock('../../backend/aiPhotoPipeline.js', () => ({
  enqueuePhotoAnalysis: vi.fn(),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  const upload = multer({ storage: multer.memoryStorage() });

  app.post('/api/media/upload', upload.single('file'), uploadMediaHandler);
  app.post('/api/tryon', createTryonHandler);
  app.get('/api/tryon/:id', getTryonStatusHandler);
  app.set('db', pool);

  return app;
}

const POLL_MS = 150;
const POLL_TIMEOUT_MS = 5000;

async function waitForTryonComplete(
  app: express.Express,
  tryonId: string,
): Promise<{ status: string; image_url: string | null; error?: string }> {
  const start = Date.now();
  for (;;) {
    const res = await request(app).get(`/api/tryon/${tryonId}`);
    if (res.status !== 200) {
      throw new Error(`GET /api/tryon/:id returned ${res.status}`);
    }
    const body = res.body as { status: string; image_url?: string | null; error?: string };
    if (body.status === 'completed' || body.status === 'failed') {
      return {
        status: body.status,
        image_url: body.image_url ?? null,
        error: body.error,
      };
    }
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error(`Timeout waiting for tryon ${tryonId}, last status: ${body.status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

describe.skipIf(!dbAvailable)(
  'TryOn pipeline: upload → tryon → result',
  () => {
  const app = createApp();

  beforeAll(async () => {
    await ensureUsersTable();
    await ensureMediaTables();
    await ensureTryonTables();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM tryon_sessions');
    await pool.query('DELETE FROM media_assets');
    vi.clearAllMocks();
  });

  it('upload person, upload clothing, tryon, result has HTTP 200 and image_url', async () => {
    const uploadPerson = await request(app)
      .post('/api/media/upload')
      .field('type', 'person')
      .attach('file', TINY_PNG, 'person.png');
    expect(uploadPerson.status).toBe(201);
    const { assetId: personAssetId } = uploadPerson.body as { assetId: string };
    expect(personAssetId).toBeDefined();

    const createTryon = await request(app)
      .post('/api/tryon')
      .send({
        person_asset_id: personAssetId,
        clothing_image_url: 'https://example.com/clothing.png',
      });
    expect(createTryon.status).toBe(201);
    const { tryon_id: tryonId } = createTryon.body as { tryon_id: string; status: string };
    expect(tryonId).toBeDefined();

    const result = await waitForTryonComplete(app, tryonId);
    expect(result.status).toBe('completed');
    expect(result.image_url).toBeDefined();
    expect(typeof result.image_url).toBe('string');
    expect((result.image_url as string).length).toBeGreaterThan(0);
  });
  },
);
