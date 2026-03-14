import express from 'express';
import type { Express } from 'express';
import multer from 'multer';
import { uploadBuffer } from '../storage.js';
import { tryOnWithFal } from '../falClient.js';
import {
  createPendingTryon,
  findActiveOwnerTryon,
  markTryonCompletedWithImageUrl,
  markTryonFailed,
  markTryonProcessing,
  trimCompletedOwnerTryons,
} from '../tryonSessions.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/api/tryon-lite',
  upload.fields([
    { name: 'person', maxCount: 1 },
    { name: 'garment', maxCount: 1 },
  ]),
  async (req, res) => {
    const owner = (req as express.Request & {
      owner?: { ownerType: 'user' | 'client'; ownerKey: string; userId: string | null };
    }).owner;
    if (!owner?.ownerKey) {
      res.status(400).json({ error: 'Не удалось определить владельца сессии.' });
      return;
    }
    const active = await findActiveOwnerTryon(owner.ownerKey);
    if (active) {
      res.status(409).json({
        error: 'Примерка уже выполняется. Дождитесь завершения текущей.',
        active_tryon_id: active.id,
      });
      return;
    }
    const session = await createPendingTryon({
      userId: owner.userId ?? null,
      ownerType: owner.ownerType,
      ownerKey: owner.ownerKey,
      personAssetId: null,
      lookId: null,
      source: 'web-lite',
      requestMeta: {},
    });
    try {
      await markTryonProcessing(session.id);
      const files = req.files as
        | Record<string, Express.Multer.File[] | undefined>
        | undefined;

      const person = files?.person?.[0];
      const garment = files?.garment?.[0];

      if (!person || !garment) {
        res
          .status(400)
          .json({ error: 'Нужно два файла: person и garment' });
        return;
      }

      // Сохраняем изображения в хранилище (без БД/сессий) и получаем стабильные URL.
      const personStored = await uploadBuffer({
        type: 'person',
        buffer: person.buffer,
        filename: person.originalname || 'person.jpg',
      });
      const garmentStored = await uploadBuffer({
        type: 'clothing',
        buffer: garment.buffer,
        filename: garment.originalname || 'garment.jpg',
      });

      // Один прямой вызов Fal через канонический клиент.
      const imageUrl = await tryOnWithFal(
        personStored.url,
        garmentStored.url,
      );
      await markTryonCompletedWithImageUrl({
        id: session.id,
        imageUrl,
        tokensCharged: 1,
      });
      await trimCompletedOwnerTryons(owner.ownerKey, 50);

      res.json({ image_url: imageUrl, session_id: session.id });
    } catch (e: any) {
      console.error('[tryon-lite] failed', e);
      await markTryonFailed(session.id, 'Не удалось создать примерку. Попробуйте ещё раз.');
      res.status(502).json({
        error: 'Не удалось создать примерку. Попробуйте ещё раз.',
      });
    }
  },
);

export default router;

