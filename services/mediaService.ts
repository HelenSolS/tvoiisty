const API_BASE = '';

export type UploadedMediaType = 'person' | 'clothing' | 'location';

export interface UploadedMediaAsset {
  assetId: string;
  type: UploadedMediaType;
  url: string;
  hash: string;
}

export async function uploadPersonPhoto(file: File): Promise<UploadedMediaAsset> {
  const form = new FormData();
  form.append('file', file);
  form.append('type', 'person');

  const res = await fetch(`${API_BASE}/api/media/upload`, {
    method: 'POST',
    body: form,
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Сервис загрузки фото вернул неверный ответ. Попробуйте позже.');
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Не удалось загрузить фото. Попробуйте позже.');
  }

  if (typeof data.assetId !== 'string' || typeof data.url !== 'string') {
    throw new Error('Сервис загрузки фото вернул неполные данные.');
  }

  return {
    assetId: data.assetId,
    type: data.type ?? 'person',
    url: data.url,
    hash: data.hash ?? '',
  };
}

