export function isAllowedImageMime(mime: string | undefined | null): boolean {
  if (!mime) return false;
  return mime.toLowerCase().startsWith('image/');
}

export function hasAllowedImageExtension(filename: string | undefined | null): boolean {
  if (!filename) return false;
  const name = filename.toLowerCase();
  return (
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    name.endsWith('.avif')
  );
}

export function isProbablyImageUpload(file: {
  mimetype?: string;
  originalname?: string;
  size?: number;
}): boolean {
  if (!file || (file.size ?? 0) <= 0) return false;
  if (isAllowedImageMime(file.mimetype)) return true;
  return hasAllowedImageExtension(file.originalname);
}

