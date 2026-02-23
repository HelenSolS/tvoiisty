export type SocialPlatformId =
  | 'telegram'
  | 'vk'
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'tenchat'
  | 'pinterest'
  | 'dzen'
  | 'ok';

export interface SocialPlatformMeta {
  id: SocialPlatformId;
  label: string;
  brandColor: string;
  bgColor: string;
  short: string;
}

export interface SocialConnectionsState {
  [key: string]: boolean;
}

export const SOCIAL_PLATFORMS: SocialPlatformMeta[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    brandColor: '#229ED9',
    bgColor: '#E0F4FF',
    short: 'TG',
  },
  {
    id: 'vk',
    label: 'VK',
    brandColor: '#0077FF',
    bgColor: '#E0F0FF',
    short: 'VK',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    brandColor: '#1778F2',
    bgColor: '#E2ECFF',
    short: 'f',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    brandColor: '#E1306C',
    bgColor: '#FFE4F0',
    short: 'IG',
  },
  {
    id: 'threads',
    label: 'Threads',
    brandColor: '#000000',
    bgColor: '#EEEEEE',
    short: 'Th',
  },
  {
    id: 'tenchat',
    label: 'TenChat',
    brandColor: '#FF3B30',
    bgColor: '#FFE5E2',
    short: '10',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    brandColor: '#E60023',
    bgColor: '#FFE2E8',
    short: 'P',
  },
  {
    id: 'dzen',
    label: 'Дзен',
    brandColor: '#000000',
    bgColor: '#F2F2F2',
    short: 'Д',
  },
  {
    id: 'ok',
    label: 'OK',
    brandColor: '#EE8208',
    bgColor: '#FFEAD1',
    short: 'OK',
  },
];

export const createDefaultSocialConnections = (): SocialConnectionsState =>
  SOCIAL_PLATFORMS.reduce<SocialConnectionsState>((acc, p) => {
    acc[p.id] = p.id === 'telegram';
    return acc;
  }, {});

export function loadSocialConnections(storageKey: string): SocialConnectionsState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (!raw) return createDefaultSocialConnections();
    const parsed = JSON.parse(raw) as SocialConnectionsState;
    const base = createDefaultSocialConnections();
    const merged: SocialConnectionsState = { ...base };
    for (const p of SOCIAL_PLATFORMS) {
      if (typeof parsed[p.id] === 'boolean') {
        merged[p.id] = parsed[p.id];
      }
    }
    return merged;
  } catch {
    return createDefaultSocialConnections();
  }
}

export function saveSocialConnections(storageKey: string, state: SocialConnectionsState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore
  }
}

