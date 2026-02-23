/**
 * Дополнительные настройки (провайдер, модели, промпты). localStorage. Issue #15.
 */

import type { AdminSettings } from '../types';
import { IMAGE_MODEL_POOL, VIDEO_MODEL_POOL } from './geminiService';
import { DEFAULT_IMAGE_PROMPT } from '../lib/provider-abstraction';

const STORAGE_KEY = 'tvoisty_admin_settings';

const DEFAULT_VIDEO_PROMPT_TEXT = 'Fashion film, person moves, outfit visible. Soft lighting, cinematic.';

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  provider: 'kie',
  defaultImageModel: IMAGE_MODEL_POOL[0],
  defaultVideoModel: VIDEO_MODEL_POOL[0],
  imageModelChoice: 'dropdown',
  imageModelsInDropdown: [...IMAGE_MODEL_POOL],
  imageBackupModel: IMAGE_MODEL_POOL.length > 1 ? IMAGE_MODEL_POOL[1] : IMAGE_MODEL_POOL[0],
  videoModelChoice: 'dropdown',
  videoModelsInDropdown: [...VIDEO_MODEL_POOL],
  videoBackupModel: VIDEO_MODEL_POOL.length > 1 ? VIDEO_MODEL_POOL[1] : VIDEO_MODEL_POOL[0],
  imagePromptMode: 'default',
  imagePromptDefaultText: DEFAULT_IMAGE_PROMPT,
  imagePromptCustom: '',
  videoPromptMode: 'default',
  videoPromptDefaultText: DEFAULT_VIDEO_PROMPT_TEXT,
  videoPromptCustom: '',
};

export function getAdminSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ADMIN_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AdminSettings>;
    return {
      ...DEFAULT_ADMIN_SETTINGS,
      ...parsed,
      imageModelsInDropdown: Array.isArray(parsed.imageModelsInDropdown)
        ? parsed.imageModelsInDropdown
        : DEFAULT_ADMIN_SETTINGS.imageModelsInDropdown,
      videoModelsInDropdown: Array.isArray(parsed.videoModelsInDropdown)
        ? parsed.videoModelsInDropdown
        : DEFAULT_ADMIN_SETTINGS.videoModelsInDropdown,
      imagePromptMode: parsed.imagePromptMode === 'openai' || parsed.imagePromptMode === 'custom' ? parsed.imagePromptMode : 'default',
      imagePromptDefaultText: typeof parsed.imagePromptDefaultText === 'string' ? parsed.imagePromptDefaultText : DEFAULT_ADMIN_SETTINGS.imagePromptDefaultText,
      imagePromptCustom: typeof parsed.imagePromptCustom === 'string' ? parsed.imagePromptCustom : '',
      videoPromptMode: parsed.videoPromptMode === 'openai' || parsed.videoPromptMode === 'custom' ? parsed.videoPromptMode : 'default',
      videoPromptDefaultText: typeof parsed.videoPromptDefaultText === 'string' ? parsed.videoPromptDefaultText : DEFAULT_ADMIN_SETTINGS.videoPromptDefaultText,
      videoPromptCustom: typeof parsed.videoPromptCustom === 'string' ? parsed.videoPromptCustom : '',
    };
  } catch {
    return DEFAULT_ADMIN_SETTINGS;
  }
}

export function setAdminSettings(settings: AdminSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('[adminSettings] save failed', e);
  }
}

/** Список моделей для выпадающего списка картинок. Пустой — режим «только по умолчанию». */
export function getImageModelsForDropdown(): string[] {
  const s = getAdminSettings();
  if (s.imageModelChoice === 'default_only') return [];
  return s.imageModelsInDropdown.length > 0 ? s.imageModelsInDropdown : [...IMAGE_MODEL_POOL];
}

export function getVideoModelsForDropdown(): string[] {
  const s = getAdminSettings();
  if (s.videoModelChoice === 'default_only') return [];
  return s.videoModelsInDropdown.length > 0 ? s.videoModelsInDropdown : [...VIDEO_MODEL_POOL];
}

/** Показывать ли выбор модели для картинок. */
export function showImageModelDropdown(): boolean {
  return getAdminSettings().imageModelChoice === 'dropdown';
}

export function showVideoModelDropdown(): boolean {
  return getAdminSettings().videoModelChoice === 'dropdown';
}

/** Модель по умолчанию для картинок. */
export function getDefaultImageModel(): string {
  const s = getAdminSettings();
  const pool = [...IMAGE_MODEL_POOL];
  return pool.includes(s.defaultImageModel as typeof pool[number]) ? s.defaultImageModel : pool[0];
}

export function getDefaultVideoModel(): string {
  const s = getAdminSettings();
  const pool = [...VIDEO_MODEL_POOL];
  return pool.includes(s.defaultVideoModel as typeof pool[number]) ? s.defaultVideoModel : pool[0];
}

/** Запасная модель для картинок (при авто-переключении). */
export function getImageBackupModel(): string {
  const s = getAdminSettings();
  const pool = [...IMAGE_MODEL_POOL];
  return pool.includes(s.imageBackupModel as typeof pool[number]) ? s.imageBackupModel : pool[1] ?? pool[0];
}

export function getVideoBackupModel(): string {
  const s = getAdminSettings();
  const pool = [...VIDEO_MODEL_POOL];
  return pool.includes(s.videoBackupModel as typeof pool[number]) ? s.videoBackupModel : pool[1] ?? pool[0];
}

/** Возвращает промпт для примерки по настройкам: default — текст из панели, openai — вызов getFromOpenAI(), custom — свой текст. */
export async function getEffectiveImagePrompt(getFromOpenAI: () => Promise<string>): Promise<string> {
  const s = getAdminSettings();
  if (s.imagePromptMode === 'custom' && s.imagePromptCustom.trim()) return s.imagePromptCustom.trim();
  if (s.imagePromptMode === 'openai') return getFromOpenAI();
  return (s.imagePromptDefaultText && s.imagePromptDefaultText.trim()) ? s.imagePromptDefaultText.trim() : DEFAULT_IMAGE_PROMPT;
}

/** Возвращает промпт для видео по настройкам. openai = не передаём (бэкенд подставит свой). */
export function getEffectiveVideoPrompt(): string | undefined {
  const s = getAdminSettings();
  if (s.videoPromptMode === 'custom' && s.videoPromptCustom.trim()) return s.videoPromptCustom.trim();
  if (s.videoPromptMode === 'openai') return undefined;
  const text = (s.videoPromptDefaultText && s.videoPromptDefaultText.trim()) ? s.videoPromptDefaultText.trim() : DEFAULT_VIDEO_PROMPT_TEXT;
  return text;
}

export { IMAGE_MODEL_POOL, VIDEO_MODEL_POOL };
export { DEFAULT_ADMIN_SETTINGS };
