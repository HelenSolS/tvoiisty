import type { Request, Response } from 'express';
import { generateImageTryOn } from '../kieClient.js';
import { createMediaAsset } from '../media.js';
import { mirrorFromUrl } from '../storage.js';
import { incrementTryonCount } from '../looks.js';
import {
  createPendingTryon,
  findExistingTryonByClientRequest,
  findTryonById,
  listUserTryons,
  markTryonCompleted,
  markTryonFailed,
  markTryonProcessing,
} from '../tryonSessions.js';
import { logTryonTokenCharge } from '../tokens.js';

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Не удалось скачать изображение для примерки: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function createTryonHandler(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: { id: string } }).user;
  const userId: string | null = user?.id ?? null;

  const {
    person_asset_id: personAssetId,
    look_id: lookId,
    scene_type: sceneType,
    provider,
    model_name: modelName,
    client_request_id: clientRequestId,
  } = req.body as {
    person_asset_id?: string;
    look_id?: string;
    scene_type?: string;
    provider?: string;
    model_name?: string;
    client_request_id?: string;
  };

  if (!personAssetId || !lookId) {
    res.status(400).json({ error: 'Нужны person_asset_id и look_id.' });
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
    lookId,
    sceneType,
    provider,
    modelName,
    clientRequestId,
    source: 'web',
    requestMeta: {},
  });

  // Синхронно запускаем генерацию, но фронтенд всё равно может опрашивать статус.
  void (async () => {
    try {
      await markTryonProcessing(session.id);

      // Получаем URL фото человека и образа.
      const personRes = await req.app
        .get('db')
        .query<{
          original_url: string;
        }>('SELECT original_url FROM media_assets WHERE id = $1', [personAssetId]);
      const lookRes = await req.app
        .get('db')
        .query<{
          main_asset_url: string;
        }>(
          `
          SELECT ma.original_url AS main_asset_url
          FROM looks l
          JOIN media_assets ma ON ma.id = l.main_asset_id
          WHERE l.id = $1
          `,
          [lookId],
        );

      const personUrl = personRes.rows[0]?.original_url;
      const clothingUrl = lookRes.rows[0]?.main_asset_url;
      if (!personUrl || !clothingUrl) {
        throw new Error('Не удалось найти изображения для примерки.');
      }

      const [personBase64, clothingBase64] = await Promise.all([
        fetchAsBase64(personUrl),
        fetchAsBase64(clothingUrl),
      ]);

      const imageUrl = await generateImageTryOn(
        personBase64,
        clothingBase64,
        undefined,
        modelName,
      );

      const stored = await mirrorFromUrl(imageUrl, {
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

      await incrementTryonCount(lookId);
      if (userId) {
        await logTryonTokenCharge({
          userId,
          tryonSessionId: session.id,
          amount: 1,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markTryonFailed(session.id, message);
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

