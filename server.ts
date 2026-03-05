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
import { ensureKieConfig } from './backend/config.js';
import { initDb } from './backend/db.js';
import { ensureAppSettings } from './backend/settings.js';
import { ensureAiLogsTable } from './backend/aiLogs.js';
import { generateImageHandler } from './backend/routes/generateImage.js';
import { generateVideoHandler } from './backend/routes/generateVideo.js';
import {
  signupHandler,
  loginHandler,
  meHandler,
  requireAuth,
  requireRole,
} from './backend/auth.js';
import {
  getGlobalSettingsHandler,
  updateGlobalSettingHandler,
} from './backend/routes/adminSettings.js';

async function main() {
  ensureKieConfig();
  await initDb();
  await ensureAppSettings();
  await ensureAiLogsTable();

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Auth endpoints
  app.post('/auth/signup', signupHandler);
  app.post('/auth/login', loginHandler);
  app.get('/auth/me', requireAuth, meHandler);

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

  // Core API
  app.post('/api/generate-image', generateImageHandler);
  app.post('/api/generate-video', generateVideoHandler);

  const PORT = Number(process.env.PORT) || 4000;
  app.listen(PORT, () => {
    console.log(`Backend: http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
