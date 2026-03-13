import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { getLooks, likeLook, unlikeLook } from '../looks.js';

export async function getLooksHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;

  const likedParam = (req.query.liked as string | undefined) ?? 'false';
  const likedOnly = likedParam === 'true';

  const sortParam = (req.query.sort as string | undefined) ?? 'created';
  const sortBy = sortParam === 'likes' || sortParam === 'tryons' ? sortParam : 'created';

  try {
    const looks = await getLooks({
      userId,
      likedOnly,
      sortBy,
    });
    if (looks.length === 0) {
      res.json({ looks: [] });
      return;
    }
    const assetIds = [...new Set(looks.map((l) => l.main_asset_id))];
    const urlsRes = await pool.query<{ id: string; original_url: string }>(
      'SELECT id, original_url FROM media_assets WHERE id = ANY($1::uuid[])',
      [assetIds],
    );
    const urlByAssetId = new Map(urlsRes.rows.map((r) => [r.id, r.original_url]));
    const looksWithUrl = looks.map((l) => ({
      ...l,
      imageUrl: urlByAssetId.get(l.main_asset_id) ?? '',
    }));
    res.json({ looks: looksWithUrl });
  } catch (err) {
    console.error('[looks] getLooksHandler error', err);
    res.status(500).json({ error: 'Не удалось загрузить образы магазина.' });
  }
}

export async function likeLookHandler(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: { id: string } }).user;
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }

  const lookId = req.params.id;
  if (!lookId) {
    res.status(400).json({ error: 'Не указан look_id.' });
    return;
  }

  try {
    await likeLook(user.id, lookId);
    res.status(204).send();
  } catch (err) {
    console.error('[looks] likeLookHandler error', err);
    res.status(500).json({ error: 'Не удалось поставить лайк.' });
  }
}

export async function unlikeLookHandler(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: { id: string } }).user;
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }

  const lookId = req.params.id;
  if (!lookId) {
    res.status(400).json({ error: 'Не указан look_id.' });
    return;
  }

  try {
    await unlikeLook(user.id, lookId);
    res.status(204).send();
  } catch (err) {
    console.error('[looks] unlikeLookHandler error', err);
    res.status(500).json({ error: 'Не удалось убрать лайк.' });
  }
}

