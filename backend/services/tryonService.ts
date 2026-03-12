import type { Pool } from 'pg';
import { getSetting } from '../settings.js';
import { execute } from './tryonEngine.js';
import { TRYON_USER_FACING_ERROR } from './tryonTypes.js';
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

export interface CreateTryonInput {
  db: Pool;
  userId: string | null;
  personAssetId: string;
  lookId?: string | null;
  clothingImageUrl?: string | null;
  sceneType?: string;
  provider?: string;
  modelName?: string;
  clientRequestId?: string;
}

export interface CreateTryonResult {
  tryon_id: string;
  status: string;
}

export async function maybeReuseExistingTryon(input: {
  userId: string | null;
  clientRequestId?: string;
}): Promise<CreateTryonResult | null> {
  const { userId, clientRequestId } = input;
  if (!userId || !clientRequestId) return null;

  const existing = await findExistingTryonByClientRequest(userId, clientRequestId);
  if (!existing) return null;

  return { tryon_id: existing.id, status: existing.status };
}

export async function createTryonSession(input: CreateTryonInput): Promise<CreateTryonResult> {
  const {
    db,
    userId,
    personAssetId,
    lookId,
    clothingImageUrl,
    sceneType,
    provider,
    modelName,
    clientRequestId,
  } = input;

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

      const personRes = await db.query<{ original_url: string }>(
        'SELECT original_url FROM media_assets WHERE id = $1',
        [personAssetId],
      );
      const personUrl = personRes.rows[0]?.original_url;
      if (!personUrl) {
        throw new Error('Не удалось найти загруженное фото человека.');
      }

      let clothingUrl: string;
      if (clothingImageUrl && clothingImageUrl.startsWith('http')) {
        clothingUrl = clothingImageUrl;
      } else if (lookId) {
        const lookRes = await db.query<{ main_asset_url: string }>(
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

  return { tryon_id: session.id, status: session.status };
}

export async function getTryonStatus(db: Pool, id: string) {
  const session = await findTryonById(id);
  if (!session) {
    return null;
  }

  let imageUrl: string | null = null;
  if (session.result_image_asset_id) {
    const resAsset = await db.query<{ original_url: string }>(
      'SELECT original_url FROM media_assets WHERE id = $1',
      [session.result_image_asset_id],
    );
    imageUrl = resAsset.rows[0]?.original_url ?? null;
  }
  if (!imageUrl && session.result_meta && typeof session.result_meta === 'object' && 'image_url' in session.result_meta) {
    const url = (session.result_meta as { image_url?: string }).image_url;
    if (typeof url === 'string' && url.trim()) imageUrl = url.trim();
  }

  return {
    status: session.status,
    image_url: imageUrl,
    video_url: null,
    error: session.error_message,
  };
}

export { listUserTryons, getHistoryHandler } from '../tryonSessions.js';


