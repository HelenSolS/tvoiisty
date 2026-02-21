
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
