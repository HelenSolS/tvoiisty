import type { Request, Response } from 'express';
import { listUserPhotos } from '../userPhotos.js';

export async function getMyPhotosHandler(req: Request, res: Response): Promise<void> {
  const owner = (req as Request & { owner?: { ownerKey?: string } }).owner;
  const ownerKey = owner?.ownerKey;
  if (!ownerKey) {
    res.json([]);
    return;
  }
  const photos = await listUserPhotos(ownerKey, 10);
  res.json(photos);
}

