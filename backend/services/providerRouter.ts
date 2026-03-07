/**
 * Роутер провайдеров Try-On (Issue #72).
 * Определяет primary/fallback по настройкам и наличию ключей.
 * Политика fallback — в tryonTypes.isFallbackAllowedForResult.
 */

import { getSetting } from '../settings.js';
import type { ProviderId } from './tryonTypes.js';

function hasKie(): boolean {
  return !!process.env.KIE_API_KEY?.trim();
}
function hasFal(): boolean {
  return !!process.env.FAL_KEY?.trim();
}

/** Primary из app_settings.ENABLED_IMAGE_PROVIDER (по умолчанию fal). */
export async function getPrimaryProvider(): Promise<ProviderId> {
  const raw = await getSetting<string>('ENABLED_IMAGE_PROVIDER');
  const v = String(raw ?? 'fal').toLowerCase();
  if (v === 'kie') return 'kie';
  return 'fal';
}

/** Резервный провайдер, если доступен. */
export function getFallbackProvider(primary: ProviderId): ProviderId | null {
  if (primary === 'kie' && hasFal()) return 'fal';
  if (primary === 'fal' && hasKie()) return 'kie';
  return null;
}

export function hasAnyProvider(): boolean {
  return hasKie() || hasFal();
}
