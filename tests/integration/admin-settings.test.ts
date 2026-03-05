import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeAll, describe, it, expect } from 'vitest';
import { ensureAppSettings, getSetting } from '../../backend/settings.js';
import { getGlobalSettingsHandler, updateGlobalSettingHandler } from '../../backend/routes/adminSettings.js';
import { requireAuth, requireRole } from '../../backend/auth.js';

const JWT_SECRET = 'test-secret-admin-settings';
process.env.JWT_SECRET = JWT_SECRET;

function createToken(role: 'admin' | 'client') {
  return jwt.sign(
    {
      id: 'test-user-id',
      email: 'test@example.com',
      global_role: role,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.get(
    '/api/admin/settings/global',
    requireAuth,
    requireRole('admin'),
    getGlobalSettingsHandler,
  );
  app.put(
    '/api/admin/settings/global/:key',
    requireAuth,
    requireRole('admin'),
    updateGlobalSettingHandler,
  );
  return app;
}

describe('Issue 36 + 61 – Global Platform Settings API', () => {
  const app = createApp();
  const adminToken = `Bearer ${createToken('admin')}`;
  const clientToken = `Bearer ${createToken('client')}`;

  beforeAll(async () => {
    // Ensure app_settings table and initial data exist.
    await ensureAppSettings();
  });

  it('returns settings for admin (GET /api/admin/settings/global)', async () => {
    const res = await request(app)
      .get('/api/admin/settings/global')
      .set('Authorization', adminToken)
      .expect(200);

    expect(res.body).toHaveProperty('settings');
    expect(res.body.settings).toHaveProperty('INITIAL_TOKENS');
  });

  it('returns 401 for unauthenticated access', async () => {
    await request(app).get('/api/admin/settings/global').expect(401);
  });

  it('returns 403 for non-admin user', async () => {
    await request(app)
      .get('/api/admin/settings/global')
      .set('Authorization', clientToken)
      .expect(403);
  });

  it('allows admin to update numeric setting and persists it', async () => {
    const newValue = 42;

    const putRes = await request(app)
      .put('/api/admin/settings/global/INITIAL_TOKENS')
      .set('Authorization', adminToken)
      .send({ value: newValue })
      .expect(200);

    expect(putRes.body).toEqual({ key: 'INITIAL_TOKENS', value: newValue });

    // Read back via API.
    const getRes = await request(app)
      .get('/api/admin/settings/global')
      .set('Authorization', adminToken)
      .expect(200);

    expect(getRes.body.settings.INITIAL_TOKENS).toBe(newValue);

    // And directly from DB helper.
    const stored = await getSetting<number>('INITIAL_TOKENS');
    expect(stored).toBe(newValue);
  });

  it('rejects invalid type for numeric settings with 400', async () => {
    const res = await request(app)
      .put('/api/admin/settings/global/INITIAL_TOKENS')
      .set('Authorization', adminToken)
      .send({ value: 'not-a-number' })
      .expect(400);

    expect(res.body.error).toMatch(/числом/);
  });

  it('rejects invalid type for string settings with 400', async () => {
    const res = await request(app)
      .put('/api/admin/settings/global/DEFAULT_IMAGE_MODEL')
      .set('Authorization', adminToken)
      .send({ value: 123 })
      .expect(400);

    expect(res.body.error).toMatch(/строк/);
  });
});

