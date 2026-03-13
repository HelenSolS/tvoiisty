import { Router, type Request, type Response } from 'express';

/**
 * Skeleton router для media API.
 * Здесь временно определён моковый endpoint загрузки,
 * без реальной работы со storage или БД.
 */
export const mediaRouter = Router();

// POST /api/media/upload — моковый ответ для фронта.
mediaRouter.post('/upload', (_req: Request, res: Response) => {
  res.json({
    assetId: 'mock-asset-1',
    url: 'https://example.com/mock-image.jpg',
  });
});

