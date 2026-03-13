import { pool } from './db.js';

export type AiGenerationStatus = 'success' | 'error';

export async function ensureAiLogsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_generation_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kind TEXT NOT NULL,                    -- image | video
      provider TEXT NOT NULL,                -- kie | fal | other
      model TEXT NOT NULL,
      duration_ms INTEGER,
      status TEXT NOT NULL,                  -- success | error
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function logAiGeneration(params: {
  kind: 'image' | 'video';
  provider: string;
  model: string;
  durationMs?: number;
  status: AiGenerationStatus;
  errorMessage?: string;
}): Promise<void> {
  const { kind, provider, model, durationMs, status, errorMessage } = params;
  try {
    await pool.query(
      `
      INSERT INTO ai_generation_logs (kind, provider, model, duration_ms, status, error_message)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [kind, provider, model, durationMs ?? null, status, errorMessage ?? null],
    );
  } catch (err) {
    // Логирование не должно ломать основную операцию.
    console.error('[aiLogs] failed to insert log', err);
  }
}

