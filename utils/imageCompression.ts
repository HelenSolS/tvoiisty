/**
 * Сжатие изображений для примерки: ресайз до разумного размера + WebP или JPEG
 * с высоким качеством (визуально без потери качества, но файл легче).
 */

const MAX_WIDTH = 1024;
const MAX_PIXELS = 1024 * 1024;
const QUALITY = 0.87;

function isWebPSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp', 0.9).startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
    img.crossOrigin = src.startsWith('http') ? 'anonymous' : undefined;
    img.src = src;
  });
}

function getScaledDimensions(
  width: number,
  height: number
): { width: number; height: number } {
  let w = width;
  let h = height;
  if (w > MAX_WIDTH) {
    h = Math.round((h * MAX_WIDTH) / w);
    w = MAX_WIDTH;
  }
  if (w * h > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (w * h));
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { width: w, height: h };
}

/**
 * Сжимает изображение для примерки: ресайз + WebP или JPEG с качеством 0.87.
 * Подходит для фото пользователя (File/data URL) и образов (URL).
 */
export async function compressImageForTryOn(
  source: string | File
): Promise<string> {
  const objectUrl =
    typeof source === 'string' ? null : URL.createObjectURL(source);
  const src = typeof source === 'string' ? source : objectUrl!;
  try {
    const img = await loadImage(src);
    const { width, height } = getScaledDimensions(img.width, img.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Ошибка canvas');

    ctx.drawImage(img, 0, 0, width, height);

    const useWebP = isWebPSupported();
    const mime = useWebP ? 'image/webp' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, QUALITY);

    return dataUrl;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
