import { pool } from './db.js';

export interface Look {
  id: string;
  store_id: string;
  title: string;
  description: string | null;
  main_asset_id: string;
  scene_type: string | null;
  is_active: boolean;
  likes_count: number;
  tryon_count: number;
  created_at: Date;
  updated_at: Date;
}

export async function ensureLooksTables(): Promise<void> {
  // Таблица looks — образы магазинов.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS looks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      main_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      scene_type TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      likes_count INT NOT NULL DEFAULT 0,
      tryon_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Таблица user_liked_looks — лайки пользователей.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_liked_looks (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      look_id UUID NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, look_id)
    )
  `);
}

export async function likeLook(userId: string, lookId: string): Promise<void> {
  await pool.query('BEGIN');
  try {
    // Вставляем лайк, если его ещё нет.
    await pool.query(
      `
      INSERT INTO user_liked_looks (user_id, look_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [userId, lookId],
    );

    // Увеличиваем likes_count, только если лайк действительно добавился.
    await pool.query(
      `
      UPDATE looks
      SET likes_count = likes_count + 1,
          updated_at = NOW()
      WHERE id = $1
        AND EXISTS (
          SELECT 1 FROM user_liked_looks
          WHERE user_id = $2 AND look_id = $1
        )
      `,
      [lookId, userId],
    );

    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

export async function unlikeLook(userId: string, lookId: string): Promise<void> {
  await pool.query('BEGIN');
  try {
    const res = await pool.query(
      'DELETE FROM user_liked_looks WHERE user_id = $1 AND look_id = $2',
      [userId, lookId],
    );

    if (res.rowCount && res.rowCount > 0) {
      await pool.query(
        `
        UPDATE looks
        SET likes_count = GREATEST(likes_count - 1, 0),
            updated_at = NOW()
        WHERE id = $1
        `,
        [lookId],
      );
    }

    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

export async function incrementTryonCount(lookId: string): Promise<void> {
  await pool.query(
    `
    UPDATE looks
    SET tryon_count = tryon_count + 1,
        updated_at = NOW()
    WHERE id = $1
    `,
    [lookId],
  );
}

export interface GetLooksOptions {
  userId?: string;
  likedOnly?: boolean;
  sortBy?: 'likes' | 'tryons' | 'created';
}

export async function getLooks(options: GetLooksOptions = {}): Promise<
  Array<
    Look & {
      liked: boolean;
      popularity_score: number;
    }
  >
> {
  const { userId, likedOnly = false, sortBy = 'created' } = options;

  const params: unknown[] = [];
  let where = 'WHERE is_active = TRUE';

  if (likedOnly && userId) {
    params.push(userId);
    where += ` AND id IN (SELECT look_id FROM user_liked_looks WHERE user_id = $${params.length})`;
  }

  let orderBy = 'ORDER BY created_at DESC';
  if (sortBy === 'likes') {
    orderBy = 'ORDER BY likes_count DESC, created_at DESC';
  } else if (sortBy === 'tryons') {
    orderBy = 'ORDER BY tryon_count DESC, created_at DESC';
  }

  const userSelect =
    userId != null
      ? `EXISTS (SELECT 1 FROM user_liked_looks ull WHERE ull.user_id = $${params.length + 1} AND ull.look_id = l.id) AS liked`
      : 'FALSE AS liked';

  if (userId != null) {
    params.push(userId);
  }

  const res = await pool.query<
    Look & {
      liked: boolean;
      popularity_score: number;
    }
  >(
    `
    SELECT
      l.*,
      ${userSelect},
      (l.likes_count * 2 + l.tryon_count) AS popularity_score
    FROM looks l
    ${where}
    ${orderBy}
    `,
    params,
  );

  return res.rows;
}

