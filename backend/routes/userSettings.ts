import type { Request, Response } from 'express';
import { getUserPreferences, mergeUserPreferences } from '../userSettings.js';

type AuthedRequest = Request & { user?: { id: string } };

export async function getUserSettingsHandler(req: Request, res: Response): Promise<void> {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }

  try {
    const preferences = await getUserPreferences(user.id);
    res.json({ preferences });
  } catch (err) {
    console.error('[userSettings] getUserSettings error', err);
    res.status(500).json({ error: 'Не удалось загрузить настройки пользователя.' });
  }
}

export async function updateUserSettingsHandler(req: Request, res: Response): Promise<void> {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }

  const body = (req.body || {}) as { preferences?: Record<string, unknown> };
  const partial = body.preferences;
  if (!partial || typeof partial !== 'object') {
    res.status(400).json({ error: 'Некорректные данные настроек.' });
    return;
  }

  try {
    const preferences = await mergeUserPreferences(user.id, partial);
    res.json({ preferences });
  } catch (err) {
    console.error('[userSettings] updateUserSettings error', err);
    res.status(500).json({ error: 'Не удалось сохранить настройки пользователя.' });
  }
}

