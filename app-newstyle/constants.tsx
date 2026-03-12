import { MagicPreset, TryOnLimits, Shop, UserRole } from './types';

export const LIMITS_CONFIG = {
  [UserRole.USER]: { images: 5, videos: 0 },
  [UserRole.MAGIC_USER]: { images: 100, videos: 10 },
  [UserRole.SHOP_USER]: { images: 10, videos: 0 },
  [UserRole.ADMIN]: { images: 999, videos: 999 }
};

export const DEFAULT_LIMITS: TryOnLimits = {
  imagesLeft: LIMITS_CONFIG[UserRole.USER].images,
  videosLeft: LIMITS_CONFIG[UserRole.USER].videos,
  lastReset: new Date().toISOString().split('T')[0]
};

export const DEFAULT_PRESETS: MagicPreset[] = [
  {
    id: 'cyber-runway',
    name: 'Кибер-Подиум 2026',
    promptTemplate: 'A cinematic high-fashion video of the person walking on a futuristic digital runway with neon lighting and liquid chrome textures.',
    active: true,
    preview: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=300'
  },
  {
    id: 'tokyo-rain',
    name: 'Токио: Неон и Дождь',
    promptTemplate: 'A stylish video of the person standing in a rainy futuristic Tokyo street, neon lights reflecting on the wet clothes and pavement.',
    active: true,
    preview: 'https://images.unsplash.com/photo-1519810755548-39cd217da494?auto=format&fit=crop&q=80&w=300'
  }
];

export const MOCK_SHOPS: Shop[] = [
  {
    id: 'aurora-digital',
    name: 'AURORA DIGITAL',
    url: 'https://aurora-fashion.com',
    collections: [
      {
        id: 'ethereal-26',
        name: 'ETHEREAL SUMMER 26',
        items: [
          { id: 'a1', title: 'Платье "Жидкий Шелк"', imageUrl: 'https://images.unsplash.com/photo-1539008835170-43d03a40e2f0?auto=format&fit=crop&q=80&w=400', buyUrl: 'https://example.com/item1', shopName: 'AURORA DIGITAL' },
          { id: 'a2', title: 'Топ "Голограмма"', imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=400', buyUrl: 'https://example.com/item2', shopName: 'AURORA DIGITAL' }
        ]
      }
    ]
  },
  {
    id: 'neo-classic',
    name: 'NEO CLASSIC',
    url: 'https://neoclassic-2026.ru',
    collections: [
      {
        id: 'future-suit',
        name: 'БИЗНЕС 2.0',
        items: [
          { id: 'n1', title: 'Смарт-Пиджак', imageUrl: 'https://images.unsplash.com/photo-1594932224456-802d92c2420b?auto=format&fit=crop&q=80&w=400', buyUrl: 'https://example.com/item3', shopName: 'NEO CLASSIC' },
          { id: 'n2', title: 'Брюки с памятью формы', imageUrl: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&q=80&w=400', buyUrl: 'https://example.com/item4', shopName: 'NEO CLASSIC' }
        ]
      }
    ]
  }
];

export const CUSTOM_SERVICE_URL = 'http://82.22.36.170:8002/generate_imagen_image';
export const CUSTOM_SERVICE_KEY = 'uktJ0P5Ad7cSGmtZAO7UuNwLIiZhvp2_5e8uhA6vCeg';