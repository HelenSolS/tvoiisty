export interface TryOnStartResponse {
  tryon_id?: string;
  sessionId?: string;
}

export type TryOnStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TryOnStatusResponse {
  status: TryOnStatus | string;
  image_url?: string | null;
  imageUrl?: string | null;
  video_url?: string | null;
  videoUrl?: string | null;
}

export interface TryOnVideoStatusResponse {
  status: TryOnStatus | 'none' | string;
  video_url?: string | null;
  videoUrl?: string | null;
}

export type TryOnResponse =
  | TryOnStartResponse
  | TryOnStatusResponse
  | TryOnVideoStatusResponse;

