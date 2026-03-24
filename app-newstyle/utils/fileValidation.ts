const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif'];

/** MIME-типы, которые точно не являются изображениями — блокируем явно. */
const BLOCKED_MIME_PREFIXES = ['video/', 'audio/', 'application/', 'text/'];

export function isValidImageFile(file: File | null | undefined): boolean {
  if (!file) return false;

  const mime = (file.type || '').toLowerCase();

  // Если MIME известен — сначала проверяем не заблокирован ли он.
  if (mime) {
    if (BLOCKED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return false;
    if (mime.startsWith('image/')) return true;
  }

  // Fallback: проверяем расширение (актуально для iOS/Android когда MIME пустой).
  const name = (file.name || '').toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export const IMAGE_VALIDATION_ERROR =
  'Пожалуйста, загрузите фото (jpg, png, webp, heic, avif). Видео и документы не поддерживаются.';

