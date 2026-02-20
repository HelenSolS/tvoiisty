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
import { generateImageHandler } from './backend/routes/generateImage.js';
import { generateVideoHandler } from './backend/routes/generateVideo.js';

ensureKieConfig();

const app = express();
app.use(express.json({ limit: '20mb' }));

app.post('/api/generate-image', generateImageHandler);
app.post('/api/generate-video', generateVideoHandler);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Backend: http://localhost:${PORT}`);
});
