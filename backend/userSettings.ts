import { pool } from './db.js';

export async function ensureUserPreferencesColumn(): Promise<void> {
  // Добавляем колонку preferences JSONB, если её ещё нет.
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb
  `);
}

export async function getUserPreferences(userId: string): Promise<Record<string, unknown>> {
  const res = await pool.query<{ preferences: Record<string, unknown> | null }>(
    'SELECT preferences FROM users WHERE id = $1',
    [userId],
  );
  const prefs = res.rows[0]?.preferences;
  return (prefs ?? {}) as Record<string, unknown>;
}

export async function mergeUserPreferences(
  userId: string,
  partial: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await pool.query<{ preferences: Record<string, unknown> | null }>(
    `
    UPDATE users
    SET preferences = COALESCE(preferences, '{}'::jsonb) || $2::jsonb
    WHERE id = $1
    RETURNING preferences
    `,
    [userId, JSON.stringify(partial)],
  );
  return (res.rows[0]?.preferences ?? {}) as Record<string, unknown>;
}

