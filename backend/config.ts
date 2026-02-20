/**
 * Конфигурация backend. Ключ KIE читается только здесь и в kieClient — на фронт не передаётся.
 * При старте сервера проверяем наличие KIE_API_KEY.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// В проде (Vercel) dotenv не используем — KIE_API_KEY берётся из process.env (Environment Variables)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

const KIE_BASE_URL_DEFAULT = 'https://api.kie.ai';

function getEnv(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

export const kieApiKey = (getEnv('KIE_API_KEY') ?? '').trim();
export const kieBaseUrl = (getEnv('KIE_BASE_URL') || KIE_BASE_URL_DEFAULT).replace(/\/$/, '');

/** Вызвать при старте server.ts: кидает ошибку, если ключа нет. */
export function ensureKieConfig(): void {
  if (!kieApiKey || kieApiKey.trim() === '') {
    throw new Error(
      'KIE_API_KEY не задан. В .env в корне проекта должна быть строка: KIE_API_KEY=ваш_ключ (без кавычек, без пробела после =). Сохраните файл и перезапустите npm run server.'
    );
  }
}
