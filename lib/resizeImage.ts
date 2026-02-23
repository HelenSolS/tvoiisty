/**
 * Адаптация изображения при загрузке: один раз уменьшаем до разумного размера.
 * Результат храним и используем как есть; перед отправкой в API повторно не уменьшаем.
 */
const DEFAULT_MAX_WIDTH = 1024;
const DEFAULT_QUALITY = 0.8;

export function resizeDataUrl(
  dataUrl: string,
  maxWidth: number = DEFAULT_MAX_WIDTH,
  quality: number = DEFAULT_QUALITY
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!dataUrl.startsWith('data:')) {
      return resolve(dataUrl);
    }
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width <= maxWidth) {
        try {
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
        return;
      }
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const out = canvas.toDataURL('image/png', quality);
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
    img.src = dataUrl;
  });
}
