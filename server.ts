import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Локально грузим .env; на Vercel (production) не трогаем — ключи из Environment Variables
if (process.env.NODE_ENV !== 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(__dirname, '.env') });
}

/**
 * Точка входа backend: Express-сервер с двумя эндпоинтами:
 *   POST /api/generate-image — примерка (KIE createTask + polling)
 *   POST /api/generate-video — видео по картинке (Veo + polling)
 * Ключ KIE читается только в backend (config + kieClient), на фронт не передаётся.
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { ensureKieConfig } from './backend/config.js';
import { initDb, pool } from './backend/db.js';
import { ensureAppSettings } from './backend/settings.js';
import { ensureAiLogsTable } from './backend/aiLogs.js';
import { ensureMediaTables } from './backend/media.js';
import { ensureUsersTable } from './backend/users.js';
import { ensureLooksTables } from './backend/looks.js';
import { ensureTryonTables } from './backend/tryonSessions.js';
import { ensureTokenTables } from './backend/tokens.js';
import { ensureUserPreferencesColumn } from './backend/userSettings.js';
import { generateImageHandler } from './backend/routes/generateImage.js';
import { generateVideoHandler } from './backend/routes/generateVideo.js';
import {
  signupHandler,
  loginHandler,
  meHandler,
  optionalAuth,
  requireAuth,
  requireRole,
} from './backend/auth.js';
import {
  getGlobalSettingsHandler,
  updateGlobalSettingHandler,
} from './backend/routes/adminSettings.js';
import { uploadMediaHandler } from './backend/routes/uploadMedia.js';
import {
  getLooksHandler,
  likeLookHandler,
  unlikeLookHandler,
} from './backend/routes/looks.js';
import {
  getUserSettingsHandler,
  updateUserSettingsHandler,
} from './backend/routes/userSettings.js';
import {
  createTryonHandler,
  getTryonStatusHandler,
  getHistoryHandler,
  listMyTryonsHandler,
} from './backend/routes/tryon.js';
import { healthHandler } from './backend/routes/health.js';

async function main() {
  ensureKieConfig();
  await initDb();
  await ensureAppSettings();
  await ensureAiLogsTable();
  await ensureMediaTables();
  await ensureUsersTable();
  await ensureLooksTables();
  await ensureTryonTables();
  await ensureTokenTables();
  await ensureUserPreferencesColumn();

  const app = express();

  // CORS: фронт на Vercel и app.tvoiistyle.top (второй интерфейс) обращаются к api.tvoiistyle.top
  const corsOptions = {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (origin === 'https://tvoiisty.vercel.app') return cb(null, true);
      if (origin === 'https://app.tvoiistyle.top') return cb(null, true);
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(express.json({ limit: '20mb' }));

  // Health-check для nginx/Docker и автотестов (JSON)
  app.get('/health', healthHandler);
  // production health endpoint под /api/health
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Health tryon pipeline: DB, storage, providers (для автотестера и мониторинга)
  app.get('/health/tryon', async (_req, res) => {
    const out: { status: string; db?: string; storage?: string; providers?: string[] } = {
      status: 'ok',
    };
    try {
      await pool.query('SELECT 1');
      out.db = 'ok';
    } catch (e) {
      out.db = 'error';
      out.status = 'degraded';
    }
    const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const hasSupabase =
      !!process.env.SUPABASE_URL?.trim() && !!process.env.SUPABASE_SERVICE_KEY?.trim();
    out.storage = hasBlob || hasSupabase ? 'ok' : 'missing';
    if (out.storage !== 'ok') out.status = 'degraded';

    const providers: string[] = [];
    if (process.env.KIE_API_KEY?.trim()) providers.push('kie');
    if (process.env.FAL_KEY?.trim()) providers.push('fal');
    out.providers = providers;
    if (providers.length === 0) out.status = 'degraded';

    const code = out.status === 'ok' ? 200 : 503;
    res.status(code).json(out);
  });

   // Делаем pool доступным в handlers через app.get('db')
  app.set('db', pool);

  // Multer для upload API (in-memory, ограничение по размеру).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // Auth endpoints
  app.post('/auth/signup', signupHandler);
  app.post('/auth/login', loginHandler);
  app.get('/auth/me', requireAuth, meHandler);

  // User preferences (Issue 37) — настройки конкретного пользователя.
  app.get('/api/user/settings', requireAuth, getUserSettingsHandler);
  app.put('/api/user/settings', requireAuth, updateUserSettingsHandler);

  // Admin: global platform settings
  app.get(
    '/api/admin/settings/global',
    requireAuth,
    requireRole('admin'),
    getGlobalSettingsHandler,
  );
  app.put(
    '/api/admin/settings/global/:key',
    requireAuth,
    requireRole('admin'),
    updateGlobalSettingHandler,
  );

  // Store looks API (Issue 51) — список образов и лайки. GET /api/looks без авторизации для демо (optionalAuth).
  app.get('/api/looks', optionalAuth, getLooksHandler);
  app.post('/api/looks/:id/like', requireAuth, likeLookHandler);
  app.delete('/api/looks/:id/like', requireAuth, unlikeLookHandler);

  // История примерок в формате для newstyle UI (sessionId, imageUrl, ...).
  app.get('/api/history', requireAuth, getHistoryHandler);

  // Unified upload API + LLM pipeline for photos (Issue 39).
  // Для демо разрешаем загрузку без авторизации (user_photos/лимиты будут позже).
  app.get('/api/media/upload/check', (_req, res) => {
    const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const hasSupabase = !!process.env.SUPABASE_URL?.trim() && !!process.env.SUPABASE_SERVICE_KEY?.trim();
    if (hasBlob || hasSupabase) {
      res.json({ storage: 'ok', backend: 'blob_or_supabase' });
    } else {
      res.status(503).json({
        storage: 'missing',
        message: 'На сервере в .env задайте BLOB_READ_WRITE_TOKEN (Vercel Blob) или SUPABASE_URL + SUPABASE_SERVICE_KEY.',
      });
    }
  });
  app.post('/api/media/upload', upload.single('file'), uploadMediaHandler);

  // Try-On Session Engine (Issue 40).
  // Для демо не требуем реальную серверную авторизацию — сессии могут быть анонимными.
  app.post('/api/tryon', createTryonHandler);
  app.get('/api/tryon/:id', getTryonStatusHandler);
  app.get('/api/my/tryons', requireAuth, listMyTryonsHandler);

  // Core API
  app.post('/api/generate-image', generateImageHandler);
  app.post('/api/generate-video', generateVideoHandler);

  // Обработчик ошибок (multer, неожиданные throw) — чтобы всегда отдавать JSON и не ронять соединение (иначе Nginx даёт 502).
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[express] unhandled error', err);
    if (!res.headersSent) {
      res.status(500).json({ error: msg || 'Внутренняя ошибка сервера.' });
    }
  });

  const PORT = Number(process.env.PORT) || 4000;
  app.listen(PORT, () => {
    console.log(`Backend: http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
