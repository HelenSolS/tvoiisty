
declare global {
  interface Window {
    aistudio?: {
      openSelectKey: () => Promise<void>;
      hasSelectedApiKey: () => Promise<boolean>;
    };
  }
}

declare global {
  interface Window {
    aistudio?: {
      openSelectKey: () => Promise<void>;
      hasSelectedApiKey: () => Promise<boolean>;
    };
  }
}

export enum UserRole {
  USER = 'user',
  MAGIC_USER = 'magic_user',
  SHOP_USER = 'shop_user',
  ADMIN = 'admin'
}

export enum Theme {
  LAVENDER = 'lavender',
  MINT = 'mint',
  PEACH = 'peach'
}

export enum Language {
  RU = 'ru',
  EN = 'en',
  ES = 'es',
  TR = 'tr'
}

export enum AIProvider {
  GEMINI = 'gemini',
  CUSTOM = 'custom'
}

export interface MagicPreset {
  id: string;
  name: string;
  promptTemplate: string;
  active: boolean;
  preview?: string;
  category?: string;
}

export interface CollectionItem {
  id: string;
  imageUrl: string;
  title: string;
  price?: string;
  buyUrl?: string;
  shopName?: string;
  shopLogo?: string;
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[];
}

export interface Shop {
  id: string;
  name: string;
  logo?: string;
  url: string;
  ownerId?: string;
  collections: Collection[];
}

export interface TryOnLimits {
  imagesLeft: number;
  videosLeft: number;
  lastReset: string;
}

export interface LookHistoryItem {
  id: string;
  imageUrl: string;
  videoUrl?: string;
  timestamp: number;
}

export interface AuthState {
  isLoggedIn: boolean;
  userEmail?: string;
  hasPaidSubscription: boolean;
  userPhotos: string[]; // История загруженных фото пользователя (лицо/тело)
  garmentMemory: string[]; // История загруженных фото одежды
  lookHistory: LookHistoryItem[]; // История созданных образов (пары фото + видео)
  likedLooks?: string[]; // Список URL понравившихся образов
  selectedUserPhoto?: string; // Активно выбранное фото пользователя (URL)
}

export interface AppState {
  role: UserRole;
  theme: Theme;
  limits: TryOnLimits;
  provider: AIProvider;
  auth: AuthState;
}
