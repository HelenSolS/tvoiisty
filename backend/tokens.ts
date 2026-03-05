import { pool } from './db.js';

export async function ensureTokenTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS token_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tryon_session_id UUID REFERENCES tryon_sessions(id) ON DELETE SET NULL,
      amount INT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_token_tx_user_created
      ON token_transactions(user_id, created_at DESC)
  `);
}

export async function logTryonTokenCharge(params: {
  userId: string;
  tryonSessionId: string;
  amount: number;
  reason?: string;
}): Promise<void> {
  await pool.query(
    `
    INSERT INTO token_transactions (user_id, tryon_session_id, amount, reason)
    VALUES ($1, $2, $3, $4)
    `,
    [params.userId, params.tryonSessionId, params.amount, params.reason ?? 'tryon_demo'],
  );
}

