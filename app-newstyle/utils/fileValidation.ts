const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif'];

export function isValidImageFile(file: File | null | undefined): boolean {
  if (!file) return false;
  if (file.type && file.type.toLowerCase().startsWith('image/')) return true;
  const name = (file.name || '').toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export const IMAGE_VALIDATION_ERROR =
  'Можно загрузить только фото (jpg, png, webp, heic/heif, avif). Видео не поддерживаются.';

