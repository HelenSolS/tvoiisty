import express from 'express';
import multer from 'multer';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, beforeAll, expect, vi, afterEach } from 'vitest';

import { uploadMediaHandler } from '../../backend/routes/uploadMedia.js';
import { requireAuth } from '../../backend/auth.js';

const { putMock, findAssetByHashMock, findOrCreateAssetByHashMock, enqueuePhotoAnalysisMock } = vi.hoisted(() => ({
  putMock: vi.fn().mockResolvedValue({
    url: 'https://blob.example.com/media/person/test.png',
  }),
  findAssetByHashMock: vi.fn().mockResolvedValue(null),
  findOrCreateAssetByHashMock: vi.fn().mockResolvedValue({
    id: 'asset-1',
    type: 'person',
    original_url: 'https://blob.example.com/media/person/test.png',
    storage_key: 'media/person/test.png',
    hash: 'dummyhash',
    mime_type: 'image/png',
    created_at: new Date(),
  }),
  enqueuePhotoAnalysisMock: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  put: putMock,
}));

vi.mock('../../backend/media.js', async (orig) => {
  const actual = await orig<typeof import('../../backend/media.js')>();
  return {
    ...actual,
    findAssetByHash: findAssetByHashMock,
    findOrCreateAssetByHash: findOrCreateAssetByHashMock,
  };
});

vi.mock('../../backend/aiPhotoPipeline.js', async (orig) => {
  const actual = await orig<typeof import('../../backend/aiPhotoPipeline.js')>();
  return {
    ...actual,
    enqueuePhotoAnalysis: enqueuePhotoAnalysisMock,
  };
});

process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-integration';

function createToken() {
  return jwt.sign(
    {
      id: 'test-user-id',
      email: 'test@example.com',
      global_role: 'client',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function createApp() {
  const app = express();
  app.use(express.json());

  const upload = multer({
    storage: multer.memoryStorage(),
  });

  app.post(
    '/api/media/upload',
    requireAuth,
    upload.single('file'),
    uploadMediaHandler,
  );

  return app;
}

describe('Issue 39 – Unified Upload API + LLM Photo Pipeline', () => {
  const app = createApp();
  const authHeader = `Bearer ${createToken()}`;

  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated upload with 401', async () => {
    await request(app)
      .post('/api/media/upload')
      .attach('file', Buffer.from('test'), 'test.png')
      .field('type', 'person')
      .expect(401);
  });

  it('rejects missing file with 400', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', authHeader)
      .expect(400);

    expect(res.body.error).toMatch(/Файл не передан/i);
  });

  it('rejects invalid media type with 400', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', authHeader)
      .attach('file', Buffer.from('test'), 'test.png')
      .field('type', 'invalid')
      .expect(400);

    expect(res.body.error).toMatch(/Некорректный тип изображения/i);
  });

  it('rejects video upload with 415', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', authHeader)
      .attach('file', Buffer.from('fake-video-binary'), 'clip.mp4')
      .field('type', 'person')
      .expect(415);

    expect(res.body.error).toMatch(/только изображения/i);
  });

  it('stores file via blob, registers media asset and enqueues AI analysis on happy path', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', authHeader)
      .attach('file', Buffer.from('fake-binary-data'), 'photo.png')
      .field('type', 'person')
      .expect(201);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(findOrCreateAssetByHashMock).toHaveBeenCalledTimes(1);
    expect(enqueuePhotoAnalysisMock).toHaveBeenCalledTimes(1);

    const [enqueueArg] = enqueuePhotoAnalysisMock.mock.calls[0];
    expect(enqueueArg).toMatchObject({
      assetId: 'asset-1',
      type: 'person',
      analysisType: 'photo_llm_v1',
    });

    expect(res.body).toEqual(
      expect.objectContaining({
        assetId: 'asset-1',
        type: 'person',
        url: expect.stringContaining('blob.example.com'),
        hash: expect.any(String),
      }),
    );
  });
});

