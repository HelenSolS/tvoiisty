/**
 * Проверки жизнеспособности сервера (smoke).
 * Запуск: npm run test:smoke
 * Опционально: TEST_SERVER_URL=https://api.tvoiistyle.top npm run test:smoke
 * Сервер должен быть уже запущен (локально или деплой).
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE = process.env.TEST_SERVER_URL ?? 'http://localhost:3000';

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, ok: res.ok };
}

describe('Server viability (smoke)', () => {
  beforeAll(() => {
    if (!BASE.startsWith('http')) {
      throw new Error('TEST_SERVER_URL must be a full URL (e.g. http://localhost:3000)');
    }
  });

  it('GET /health returns 200 and status ok', async () => {
    const { status, data } = await fetchJson('/health');
    expect(status).toBe(200);
    expect((data as { status?: string })?.status).toBe('ok');
  });

  it('GET /health/tryon returns JSON with db, storage, providers', async () => {
    const { status, data } = await fetchJson('/health/tryon');
    expect([200, 503]).toContain(status);
    expect(data).toBeDefined();
    const o = data as Record<string, unknown>;
    expect(o.status).toBeDefined();
    expect(o.db).toBeDefined();
    expect(o.storage).toBeDefined();
    expect(Array.isArray(o.providers)).toBe(true);
  });

  it('GET /api/media/upload/check returns JSON (200 or 503)', async () => {
    const { status, data } = await fetchJson('/api/media/upload/check');
    expect([200, 503]).toContain(status);
    expect(data).toBeDefined();
    expect(typeof data === 'object' && data !== null && 'storage' in (data as object)).toBe(true);
  });

  it('POST /auth/signup with valid body returns 201 or 409', async () => {
    const { status, data } = await fetchJson('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: `smoke-${Date.now()}@example.com`,
        password: 'smoke-test-password-123',
      }),
    });
    expect([201, 409]).toContain(status);
    if (status === 201) {
      expect(typeof data === 'object' && data !== null && 'token' in (data as object)).toBe(true);
    }
  });

  it('GET /api/looks without auth returns 200 and looks array (optionalAuth for demo)', async () => {
    const { status, data } = await fetchJson('/api/looks');
    expect(status).toBe(200);
    expect(typeof data === 'object' && data !== null && 'looks' in (data as object)).toBe(true);
    expect(Array.isArray((data as { looks: unknown }).looks)).toBe(true);
  });

  it('POST /api/tryon without body returns 400 with error message', async () => {
    const { status, data } = await fetchJson('/api/tryon', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    const err = (data as { error?: string })?.error;
    expect(typeof err === 'string' && err.length > 0).toBe(true);
  });

  it('POST /api/tryon with person_asset_id only returns 400 (need look_id or clothing_image_url)', async () => {
    const { status, data } = await fetchJson('/api/tryon', {
      method: 'POST',
      body: JSON.stringify({
        person_asset_id: '00000000-0000-0000-0000-000000000001',
      }),
    });
    expect(status).toBe(400);
    const err = (data as { error?: string })?.error;
    expect(typeof err === 'string').toBe(true);
  });

  // QA F18: requests with owner headers are not blocked (CORS / API behaviour)
  it('GET /api/history with X-Client-Id returns 200 and array', async () => {
    const { status, data } = await fetchJson('/api/history', {
      headers: { 'X-Client-Id': 'smoke-test-client' },
    });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
});
