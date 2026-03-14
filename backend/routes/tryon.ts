import { Router } from 'express';

/**
 * Try-On API (Issue #72).
 * Тонкий controller: валидация, сбор TryOnRequest, вызов TryOnEngine.execute(), ответ.
 * Никаких прямых вызовов KIE/Fal — только движок и сессии/хранилище.
 */

import type { Request, Response } from 'express';
import {
  deleteOwnerTryon,
  findTryonById,
  markOwnerTryonsViewed,
  createTryonSession,
  getTryonStatus as getTryonStatusService,
  listOwnerTryons,
  listUserTryons,
  maybeReuseExistingTryon,
  setTryonLiked,
  updateOwnerTryonVideoAsset,
} from '../services/tryonService.js';
import { generateVideoFromImage } from '../kieClient.js';
import { getSetting } from '../settings.js';
import { mirrorFromUrl } from '../storage.js';
import { createMediaAsset } from '../media.js';

export async function createTryonHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerType: 'user' | 'client'; ownerKey: string; userId: string | null } }).owner;
  if (!owner?.ownerKey) {
    res.status(400).json({ error: 'Не удалось определить владельца сессии.' });
    return;
  }
  const user = (req as Request & { user?: { id: string } }).user;
  const userId: string | null = user?.id ?? owner.userId ?? null;

  const {
    person_asset_id: personAssetId,
    look_id: lookId,
    clothing_image_url: clothingImageUrl,
    scene_type: sceneType,
    provider,
    model_name: modelName,
    client_request_id: clientRequestId,
  } = req.body as {
    person_asset_id?: string;
    look_id?: string;
    clothing_image_url?: string;
    scene_type?: string;
    provider?: string;
    model_name?: string;
    client_request_id?: string;
  };

  if (!personAssetId) {
    res.status(400).json({ error: 'Не указано фото для примерки. Загрузите своё фото.' });
    return;
  }
  if (!lookId && !clothingImageUrl) {
    res.status(400).json({ error: 'Не указан образ одежды. Выберите вещь из витрины.' });
    return;
  }

  const reused = await maybeReuseExistingTryon({ ownerKey: owner.ownerKey, clientRequestId });
  if (reused) {
    res.status(200).json(reused);
    return;
  }

  const db = req.app.get('db');
  const result = await createTryonSession({
    db,
    userId,
    ownerType: owner.ownerType,
    ownerKey: owner.ownerKey,
    personAssetId,
    lookId: lookId || null,
    clothingImageUrl: clothingImageUrl || null,
    sceneType,
    provider,
    modelName,
    clientRequestId,
  });

  res.status(201).json(result);
}

export async function getTryonStatusHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Не указан tryon_id.' });
    return;
  }

  const db = req.app.get('db');
  const status = await getTryonStatusService(db, id);
  if (!status) {
    res.status(404).json({ error: 'Сессия примерки не найдена.' });
    return;
  }
  res.json(status);
}

export async function listMyTryonsHandler(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: { id: string } }).user;
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }

  const sessions = await listUserTryons(user.id);
  const ids = sessions
    .map((s) => [s.result_image_asset_id, s.person_asset_id, s.look_id] as const)
    .flat()
    .filter((v): v is string => !!v);
  const uniqueIds = Array.from(new Set(ids));

  const assetsRes = await req.app
    .get('db')
    .query<{ id: string; original_url: string; type: string }>(
      'SELECT id, original_url, type FROM media_assets WHERE id = ANY($1::uuid[])',
      [uniqueIds],
    );
  const assetsById = new Map(assetsRes.rows.map((a) => [a.id, a]));

  const looksRes = await req.app
    .get('db')
    .query<{ id: string; title: string }>('SELECT id, title FROM looks WHERE id = ANY($1::uuid[])', [
      Array.from(new Set(sessions.map((s) => s.look_id).filter((v): v is string => !!v))),
    ]);
  const looksById = new Map(looksRes.rows.map((l) => [l.id, l]));

  res.json({
    tryons: sessions.map((s) => ({
      tryon_id: s.id,
      look_id: s.look_id,
      person_asset_id: s.person_asset_id,
      image_url: s.result_image_asset_id
        ? assetsById.get(s.result_image_asset_id ?? '')?.original_url ?? null
        : null,
      video_url: null,
      created_at: s.created_at,
      look_title: s.look_id ? looksById.get(s.look_id)?.title ?? null : null,
    })),
  });
}

/** GET /api/history — формат для newstyle UI: sessionId, imageUrl, videoUrl, createdAt, lookId, hasVideo. Только completed, текущий пользователь. */
export async function getHistoryHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerKey: string } }).owner;
  if (!owner?.ownerKey) {
    res.status(400).json({ error: 'Не удалось определить владельца истории.' });
    return;
  }

  const sessions = await listOwnerTryons(owner.ownerKey, 50);
  const completed = sessions.filter((s) => s.status === 'completed');
  const ids = completed
    .map((s) => [s.result_image_asset_id, s.result_video_asset_id] as const)
    .flat()
    .filter((v): v is string => !!v);
  const uniqueIds = Array.from(new Set(ids));

  const assetsRes = await req.app
    .get('db')
    .query<{ id: string; original_url: string }>(
      'SELECT id, original_url FROM media_assets WHERE id = ANY($1::uuid[])',
      [uniqueIds],
    );
  const assetsById = new Map(assetsRes.rows.map((a) => [a.id, a.original_url]));

  const rows = completed.map((s) => {
    let imageUrl: string | null = s.result_image_asset_id
      ? assetsById.get(s.result_image_asset_id ?? '') ?? null
      : null;
    if (!imageUrl && s.result_meta && typeof s.result_meta === 'object' && 'image_url' in s.result_meta) {
      const u = (s.result_meta as { image_url?: string }).image_url;
      if (typeof u === 'string' && u.trim()) imageUrl = u.trim();
    }
    const videoUrl = s.result_video_asset_id ? assetsById.get(s.result_video_asset_id) ?? null : null;
    return {
      sessionId: s.id,
      imageUrl: imageUrl ?? undefined,
      videoUrl: videoUrl ?? undefined,
      createdAt: s.completed_at ?? s.created_at,
      lookId: s.look_id ?? undefined,
      hasVideo: !!s.result_video_asset_id,
      liked: !!s.liked,
      isNew: !s.viewed_at,
    };
  });

  res.json(rows);
}

export async function setHistoryLikeHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerKey: string } }).owner;
  const sessionId = req.params.id;
  const liked = !!(req.body as { liked?: boolean } | undefined)?.liked;
  if (!owner?.ownerKey || !sessionId) {
    res.status(400).json({ error: 'Не удалось определить владельца/сессию.' });
    return;
  }
  await setTryonLiked(owner.ownerKey, sessionId, liked);
  res.json({ ok: true, liked });
}

export async function deleteHistoryItemHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerKey: string } }).owner;
  const sessionId = req.params.id;
  if (!owner?.ownerKey || !sessionId) {
    res.status(400).json({ error: 'Не удалось определить владельца/сессию.' });
    return;
  }
  await deleteOwnerTryon(owner.ownerKey, sessionId);
  res.json({ ok: true });
}

async function resolveVideoModel(bodyModel: unknown): Promise<string> {
  const ALLOWED = new Set([
    'grok-imagine/image-to-video',
    'kling/v2-1-standard',
    'veo-3-1',
    'runway/gen-3-alpha-turbo',
    'hailuo/2-3-image-to-video-standard',
    'wan/2-2-a14b-image-to-video-turbo',
  ]);
  if (typeof bodyModel === 'string' && ALLOWED.has(bodyModel)) return bodyModel;
  const fromSettings = await getSetting<string>('DEFAULT_VIDEO_MODEL');
  if (typeof fromSettings === 'string' && fromSettings.trim()) return fromSettings.trim();
  return process.env.KIE_VIDEO_MODEL || 'grok-imagine/image-to-video';
}

export async function reanimateHistoryItemHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerKey: string } }).owner;
  const sessionId = req.params.id;
  if (!owner?.ownerKey || !sessionId) {
    res.status(400).json({ error: 'Не удалось определить владельца/сессию.' });
    return;
  }

  const session = await findTryonById(sessionId);
  if (!session || session.owner_key !== owner.ownerKey) {
    res.status(404).json({ error: 'Сессия истории не найдена.' });
    return;
  }

  let imageUrl: string | null = null;
  if (session.result_image_asset_id) {
    const imageRes = await req.app
      .get('db')
      .query<{ original_url: string }>('SELECT original_url FROM media_assets WHERE id = $1', [
        session.result_image_asset_id,
      ]);
    imageUrl = imageRes.rows[0]?.original_url ?? null;
  }
  if (!imageUrl && session.result_meta && typeof session.result_meta === 'object' && 'image_url' in session.result_meta) {
    const fromMeta = (session.result_meta as { image_url?: string }).image_url;
    if (typeof fromMeta === 'string' && fromMeta.trim()) imageUrl = fromMeta.trim();
  }
  if (!imageUrl) {
    res.status(422).json({ error: 'Не удалось получить изображение для анимации.' });
    return;
  }

  const body = req.body as { prompt?: string; model?: string };
  const model = await resolveVideoModel(body?.model);
  const providerVideoUrl = await generateVideoFromImage(imageUrl, body?.prompt, model);

  // Сохраняем видео в нашем хранилище и обновляем существующую history-сессию (overwrite pointer).
  const stored = await mirrorFromUrl(providerVideoUrl, {
    type: 'tryon_result_video',
    filename: 'tryon-video.mp4',
  });
  const hash = Buffer.from(stored.storageKey).toString('hex').slice(0, 64);
  const videoAsset = await createMediaAsset({
    type: 'tryon_result_video',
    originalUrl: stored.url,
    storageKey: stored.storageKey,
    hash,
  });
  await updateOwnerTryonVideoAsset(owner.ownerKey, sessionId, videoAsset.id);

  res.json({ ok: true, videoUrl: stored.url });
}

export async function markHistoryViewedHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerKey: string } }).owner;
  const ids = ((req.body as { ids?: string[] } | undefined)?.ids || []).filter(Boolean);
  if (!owner?.ownerKey || ids.length === 0) {
    res.json({ ok: true });
    return;
  }
  await markOwnerTryonsViewed(owner.ownerKey, ids);
  res.json({ ok: true });
}

/**
 * Skeleton Router для моковых try-on endpoints, без Fal/KIE и БД.
 * Используется только в backend skeleton, не заменяя рабочие handlers выше.
 */
export const tryonRouter = Router();

// POST /api/tryon — моковый старт примерки
tryonRouter.post('/', (_req: Request, res: Response) => {
  res.json({
    tryon_id: 'mock-tryon-1',
    status: 'processing',
  });
});

// GET /api/tryon/:id — моковый статус с готовой картинкой
tryonRouter.get('/:id', (_req: Request, res: Response) => {
  res.json({
    status: 'completed',
    image_url: 'https://example.com/mock-result.jpg',
  });
});

// GET /api/tryon/:id/video-status — моковый статус видео
tryonRouter.get('/:id/video-status', (_req: Request, res: Response) => {
  res.json({
    status: 'pending',
  });
});

