
export interface TryOnState {
  personImage: string | null;
  outfitImage: string | null;
  resultImage: string | null;
  isProcessing: boolean;
  status: string;
  error: string | null;
}

export type AppTheme = 'turquoise' | 'lavender' | 'peach';

export interface User {
  name: string;
  avatar: string;
  isRegistered: boolean;
  tryOnCount: number;
  role: 'user' | 'merchant';
  isVerifiedMerchant: boolean;
  theme: AppTheme;
}

/** Режим промпта: стандартный (редактируемый текст), через ИИ (Fal/OpenAI), свой текст. */
export type PromptMode = 'default' | 'openai' | 'custom';

/** Дополнительные настройки (провайдер KIE/Fal, модели, промпты). Issue #15. */
export interface AdminSettings {
  provider: 'kie' | 'fal';
  defaultImageModel: string;
  defaultVideoModel: string;
  imageModelChoice: 'default_only' | 'dropdown';
  imageModelsInDropdown: string[];
  imageBackupModel: string;
  videoModelChoice: 'default_only' | 'dropdown';
  videoModelsInDropdown: string[];
  videoBackupModel: string;
  /** Промпт для картинки: default = стандартный (редактируемый), openai = через Fal, custom = свой текст. */
  imagePromptMode: PromptMode;
  /** Текст промпта по умолчанию для примерки (режим default). */
  imagePromptDefaultText: string;
  /** Свой промпт для примерки (режим custom). */
  imagePromptCustom: string;
  videoPromptMode: PromptMode;
  videoPromptDefaultText: string;
  videoPromptCustom: string;
  /** При ошибке первой модели (KIE) автоматически пробовать запасную (Fal). Выключено — процесс заканчивается после первого ответа (даже с ошибкой). */
  imageFallbackEnabled: boolean;
}

export type CategoryType = 'all' | 'dresses' | 'suits' | 'casual' | 'outerwear' | 'men' | 'women';

export interface CuratedOutfit {
  id: string;
  name: string;
  imageUrl: string;
  shopUrl: string;
  category: CategoryType;
  status?: 'active' | 'moderation';
  merchantId?: string;
  stats?: {
    tryOns: number;
    clicks: number;
  };
}

export interface PersonGalleryItem {
  id: string;
  imageUrl: string;
}

export interface HistoryItem {
  id: string;
  resultUrl: string;
  outfitUrl: string;
  shopUrl: string;
  timestamp: number;
  /** URL видео из «Анимировать» — храним локально (localStorage) */
  videoUrl?: string;
}

/** Эксперимент лаборатории: примерка (человек + образ → результат). */
export interface LabTryOnExperiment {
  id: string;
  personUrl: string;
  outfitUrl: string;
  resultUrl: string;
  provider: string;
  durationMs: number;
  timestamp: number;
}

/** Эксперимент лаборатории: видео по картинке. */
export interface LabVideoExperiment {
  id: string;
  sourceImageUrl: string;
  videoUrl: string;
  provider: string;
  durationMs: number;
  timestamp: number;
}
