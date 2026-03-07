/**
 * GET /health — проверка, что сервер работает.
 * Ответ в JSON для автотестов и мониторинга.
 */

import type { Request, Response } from 'express';

export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    service: 'tryon-server',
  });
}
