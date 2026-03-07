import type { Request, Response } from 'express';
import { getAllSettings, setSetting } from '../settings.js';

export async function getGlobalSettingsHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const settings = await getAllSettings();
    res.json({ settings });
  } catch (err) {
    console.error('[adminSettings] getGlobalSettings error', err);
    res.status(500).json({ error: 'Не удалось загрузить глобальные настройки.' });
  }
}

export async function updateGlobalSettingHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const key = req.params.key;
    if (!key) {
      res.status(400).json({ error: 'Не указан ключ настройки.' });
      return;
    }
    const { value } = req.body ?? {};
    if (value === undefined) {
      res.status(400).json({ error: 'Не передано значение настройки.' });
      return;
    }

    // Простая валидация по типу для известных ключей.
    const numberKeys = new Set([
      'INITIAL_TOKENS',
      'FREE_DAILY_IMAGES',
      'FREE_DAILY_VIDEOS',
      'TOKENS_PER_IMAGE',
      'TOKENS_PER_VIDEO',
      'TRYON_RESULT_TTL_DAYS',
    ]);
    const stringKeys = new Set([
      'DEFAULT_IMAGE_MODEL',
      'DEFAULT_VIDEO_MODEL',
      'ENABLED_IMAGE_PROVIDER',
      'ENABLED_VIDEO_PROVIDER',
    ]);

    if (numberKeys.has(key) && typeof value !== 'number') {
      res.status(400).json({ error: `Значение ${key} должно быть числом.` });
      return;
    }
    if (stringKeys.has(key) && typeof value !== 'string') {
      res.status(400).json({ error: `Значение ${key} должно быть строкой.` });
      return;
    }

    await setSetting(key, value);
    res.json({ key, value });
  } catch (err) {
    console.error('[adminSettings] updateGlobalSetting error', err);
    res.status(500).json({ error: 'Не удалось сохранить настройку.' });
  }
}

