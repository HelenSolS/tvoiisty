import { pool } from './db.js';

export type AppSettings = Record<string, unknown>;

const INITIAL_SETTINGS: AppSettings = {
  INITIAL_TOKENS: 10,
  FREE_DAILY_IMAGES: 3,
  FREE_DAILY_VIDEOS: 1,
  TOKENS_PER_IMAGE: 1,
  TOKENS_PER_VIDEO: 5,
  DEFAULT_IMAGE_MODEL: 'fal-ai/nano-banana-pro/edit',
  DEFAULT_VIDEO_MODEL: 'grok-imagine/image-to-video',
  ENABLED_IMAGE_PROVIDER: 'fal',
  ENABLED_VIDEO_PROVIDER: 'fal',
  TRYON_RESULT_TTL_DAYS: 7,
};

/** Создаёт таблицу app_settings и наполняет базовыми значениями, если их ещё нет. */
export async function ensureAppSettings(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      description TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const entries = Object.entries(INITIAL_SETTINGS);
  for (const [key, value] of entries) {
    await pool.query(
      `
      INSERT INTO app_settings (key, value)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO NOTHING
      `,
      [key, JSON.stringify(value)],
    );
  }
}

export async function getAllSettings(): Promise<AppSettings> {
  const res = await pool.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM app_settings',
  );
  const out: AppSettings = {};
  for (const row of res.rows) {
    out[row.key] = row.value;
  }
  return out;
}

export async function getSetting<T = unknown>(
  key: string,
  defaultValue?: T,
): Promise<T | undefined> {
  const res = await pool.query<{ value: T }>(
    'SELECT value FROM app_settings WHERE key = $1',
    [key],
  );
  if (!res.rowCount) return defaultValue;
  return (res.rows[0].value ?? defaultValue) as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await pool.query(
    `
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [key, JSON.stringify(value)],
  );
}

