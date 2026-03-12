/**
 * Try-On API (Issue #72).
 * Тонкий controller: валидация, сбор TryOnRequest, вызов TryOnEngine.execute(), ответ.
 * Никаких прямых вызовов KIE/Fal — только движок и сессии/хранилище.
 */

import type { Request, Response } from 'express';
import { getSetting } from '../settings.js';
import { execute } from '../services/tryonEngine.js';
import { TRYON_USER_FACING_ERROR } from '../services/tryonTypes.js';
import { createMediaAsset } from '../media.js';
import { mirrorFromUrl } from '../storage.js';
import { incrementTryonCount } from '../looks.js';
import {
  createPendingTryon,
  findExistingTryonByClientRequest,
  findTryonById,
  listUserTryons,
  markTryonCompleted,
  markTryonCompletedWithImageUrl,
  markTryonFailed,
  markTryonProcessing,
} from '../tryonSessions.js';
import { logTryonTokenCharge } from '../tokens.js';

export async function createTryonHandler(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: { id: string } }).user;
  const userId: string | null = user?.id ?? null;

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

  if (clientRequestId && userId) {
    const existing = await findExistingTryonByClientRequest(userId, clientRequestId);
    if (existing) {
      res.status(200).json({ tryon_id: existing.id, status: existing.status });
      return;
    }
  }

  const session = await createPendingTryon({
    userId,
    personAssetId,
    lookId: lookId || null,
    sceneType,
    provider,
    modelName,
    clientRequestId,
    source: 'web',
    requestMeta: {},
  });

  void (async () => {
    try {
      await markTryonProcessing(session.id);

      const personRes = await req.app
        .get('db')
        .query<{ original_url: string }>('SELECT original_url FROM media_assets WHERE id = $1', [personAssetId]);
      const personUrl = personRes.rows[0]?.original_url;
      if (!personUrl) {
        throw new Error('Не удалось найти загруженное фото человека.');
      }

      let clothingUrl: string;
      if (clothingImageUrl && clothingImageUrl.startsWith('http')) {
        clothingUrl = clothingImageUrl;
      } else if (lookId) {
        const lookRes = await req.app.get('db').query<{ main_asset_url: string }>(
          `SELECT ma.original_url AS main_asset_url
           FROM looks l
           JOIN media_assets ma ON ma.id = l.main_asset_id
           WHERE l.id = $1`,
          [lookId],
        );
        clothingUrl = lookRes.rows[0]?.main_asset_url ?? '';
        if (!clothingUrl) {
          throw new Error('Образ одежды не найден. Выберите другой образ из витрины.');
        }
      } else {
        throw new Error('Не указан образ одежды. Выберите вещь из витрины.');
      }

      // Модель примерки: из тела запроса или из настроек (DEFAULT_IMAGE_MODEL). Канон: при virtual-try-on подменяем на nano-banana.
      const rawModel =
        modelName && typeof modelName === 'string'
          ? modelName
          : (await getSetting<string>('DEFAULT_IMAGE_MODEL')) ?? 'fal-ai/nano-banana-pro/edit';
      const raw = String(rawModel ?? '').trim().toLowerCase();
      const effectiveModel =
        raw.includes('virtual-try-on') || raw.includes('image-apps-v2')
          ? 'fal-ai/nano-banana-pro/edit'
          : rawModel && rawModel.includes('/')
            ? String(rawModel).trim()
            : 'fal-ai/nano-banana-pro/edit';
      const tryonRequest = { personUrl, clothingUrl, modelName: effectiveModel };
      const result = await execute(tryonRequest);

      if (!result.success) {
        const role = result.wasFallback ? 'fallback KIE' : `primary ${result.failedProvider ?? 'unknown'}`;
        console.error('[tryon] ALERT failed', {
          sessionId: session.id,
          provider: role,
          internalError: result.errorMessage,
        });
        await markTryonFailed(session.id, TRYON_USER_FACING_ERROR);
        return;
      }

      const providerImageUrl = result.imageUrl;
      try {
        const stored = await mirrorFromUrl(providerImageUrl, {
          type: 'tryon_result_image',
          filename: 'tryon-result.png',
        });
        const hash = Buffer.from(stored.storageKey).toString('hex').slice(0, 64);
        const resultAsset = await createMediaAsset({
          type: 'tryon_result_image',
          originalUrl: stored.url,
          storageKey: stored.storageKey,
          hash,
        });

        await markTryonCompleted({
          id: session.id,
          resultImageAsset: resultAsset,
          tokensCharged: 1,
          resultMeta: {},
        });
      } catch (storageErr) {
        console.warn('[tryon] mirror/storage failed, delivering provider URL', storageErr);
        await markTryonCompletedWithImageUrl({
          id: session.id,
          imageUrl: providerImageUrl,
          tokensCharged: 1,
        });
      }

      if (lookId) {
        await incrementTryonCount(lookId);
      }
      if (userId) {
        await logTryonTokenCharge({
          userId,
          tryonSessionId: session.id,
          amount: 1,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[tryon] ALERT exception', { sessionId: session.id, internalError: message });
      await markTryonFailed(session.id, TRYON_USER_FACING_ERROR);
    }
  })();

  res.status(201).json({ tryon_id: session.id, status: session.status });
}

export async function getTryonStatusHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Не указан tryon_id.' });
    return;
  }

  const session = await findTryonById(id);
  if (!session) {
    res.status(404).json({ error: 'Сессия примерки не найдена.' });
    return;
  }

  let imageUrl: string | null = null;
  if (session.result_image_asset_id) {
    const resAsset = await req.app
      .get('db')
      .query<{ original_url: string }>('SELECT original_url FROM media_assets WHERE id = $1', [
        session.result_image_asset_id,
      ]);
    imageUrl = resAsset.rows[0]?.original_url ?? null;
  }
  if (!imageUrl && session.result_meta && typeof session.result_meta === 'object' && 'image_url' in session.result_meta) {
    const url = (session.result_meta as { image_url?: string }).image_url;
    if (typeof url === 'string' && url.trim()) imageUrl = url.trim();
  }

  res.json({
    status: session.status,
    image_url: imageUrl,
    video_url: null,
    error: session.error_message,
  });
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
  const user = (req as Request & { user?: { id: string } }).user;
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }

  const sessions = await listUserTryons(user.id, 50);
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
    };
  });

  res.json(rows);
}
