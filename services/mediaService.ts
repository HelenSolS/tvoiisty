const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

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

/** Преобразовать data URL в File для загрузки. */
function dataUrlToFile(dataUrl: string, filename = 'image.png'): File {
  const [head, base64] = dataUrl.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/** Загрузить фото одежды (файл или data URL). Нужно для примерки по образам из коллекции магазина. */
export async function uploadClothingImage(fileOrDataUrl: File | string): Promise<{ url: string }> {
  const file = typeof fileOrDataUrl === 'string'
    ? dataUrlToFile(fileOrDataUrl, `clothing-${Date.now()}.png`)
    : fileOrDataUrl;
  const form = new FormData();
  form.append('file', file);
  form.append('type', 'clothing');

  const res = await fetch(`${API_BASE}/api/media/upload`, {
    method: 'POST',
    body: form,
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Сервис загрузки вернул неверный ответ. Попробуйте позже.');
  }

  if (!res.ok) {
    throw new Error(data?.error ?? 'Не удалось загрузить изображение. Попробуйте позже.');
  }

  if (typeof data.url !== 'string') {
    throw new Error('Сервис не вернул ссылку на изображение.');
  }

  return { url: data.url };
}

