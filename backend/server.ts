import express from 'express';
import type { Request, Response } from 'express';
import { mediaRouter } from './routes/media.js';
import { createTryonHandler, getTryonStatusHandler } from './routes/tryon.js';

/**
 * Backend skeleton server.
 * Подключены только базовые middlewares и пустые/тонкие роуты.
 * Никакой новой бизнес-логики, БД или внешних API здесь не реализуем.
 */
export function createApp() {
  const app = express();

  // Базовый JSON-parsing middleware
  app.use(express.json());

  // Health-check для проверки, что сервер жив.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Skeleton media API (пока без обработчиков внутри router'а)
  app.use('/api/media', mediaRouter);

  // Try-on endpoints: подключаем существующие handlers без изменения логики.
  app.post('/api/tryon', createTryonHandler);
  app.get('/api/tryon/:id', getTryonStatusHandler);

  return app;
}

