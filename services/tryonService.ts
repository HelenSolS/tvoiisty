const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface CreateTryonRequest {
  personAssetId: string;
  /** ID образа из БД (looks). Если нет — передайте clothingImageUrl. */
  lookId?: string;
  /** URL картинки одежды (для статичной витрины без look_id). */
  clothingImageUrl?: string;
  sceneType?: string;
  clientRequestId?: string;
}

export interface CreateTryonResponse {
  tryon_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
}

export interface TryonStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  image_url: string | null;
  video_url: string | null;
  error: string | null;
}

export async function createTryon(req: CreateTryonRequest): Promise<CreateTryonResponse> {
  const res = await fetch(`${API_BASE}/api/tryon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_asset_id: req.personAssetId,
      ...(req.lookId != null && { look_id: req.lookId }),
      ...(req.clothingImageUrl != null && { clothing_image_url: req.clothingImageUrl }),
      scene_type: req.sceneType,
      client_request_id: req.clientRequestId,
    }),
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Сервис примерки вернул неверный ответ. Попробуйте позже.');
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Не удалось создать примерку. Попробуйте позже.');
  }

  if (typeof data.tryon_id !== 'string') {
    throw new Error('Не получен идентификатор примерки.');
  }

  return {
    tryon_id: data.tryon_id,
    status: data.status ?? 'pending',
  };
}

export async function getTryonStatus(id: string): Promise<TryonStatusResponse> {
  const res = await fetch(`${API_BASE}/api/tryon/${encodeURIComponent(id)}`, {
    method: 'GET',
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Сервис примерки вернул неверный ответ. Попробуйте позже.');
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Не удалось получить статус примерки.');
  }

  return {
    status: data.status,
    image_url: data.image_url ?? null,
    video_url: data.video_url ?? null,
    error: data.error ?? null,
  };
}

