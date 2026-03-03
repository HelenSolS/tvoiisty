import pg from 'pg';

const {
  PGHOST = 'localhost',
  PGPORT = '5432',
  PGUSER = 'tvoiisty',
  PGPASSWORD = '',
  PGDATABASE = 'tvoiisty_db',
  DATABASE_URL,
} = process.env;

const connectionString =
  DATABASE_URL ||
  `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(
    PGPASSWORD ?? ''
  )}@${PGHOST}:${PGPORT}/${PGDATABASE}`;

export const pool = new pg.Pool({
  connectionString,
});

export async function initDb(): Promise<void> {
  // Простейшая проверка соединения при старте.
  await pool.query('SELECT 1');
}

