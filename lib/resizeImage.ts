/**
 * Одно сжатие при загрузке/сохранении — храним уже сжатое, в запрос отправляем как есть.
 * Параметры под лимит тела Vercel (~4.5 MB) для двух картинок в одном запросе.
 */
const STORAGE_MAX_DIM = 768;
const STORAGE_QUALITY = 0.72;

function resizeToStorageFormat(
  dataUrl: string,
  maxDim: number = STORAGE_MAX_DIM,
  quality: number = STORAGE_QUALITY
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!dataUrl.startsWith('data:')) {
      return resolve(dataUrl);
    }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(dataUrl);
        }
        ctx.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
        return;
      }
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(dataUrl);
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
    img.src = dataUrl;
  });
}

/**
 * Сжатие при загрузке: человек, товар, коллекция. Результат сохраняем — в API отправляем без повторного сжатия.
 */
export const resizeDataUrlForStorage = resizeToStorageFormat;

/** Для обратной совместиости: галерея/витрина хранят уже сжатое. */
export function resizeDataUrl(
  dataUrl: string,
  _maxWidth?: number,
  _quality?: number
): Promise<string> {
  return resizeDataUrlForStorage(dataUrl);
}

/**
 * Только для образа по внешней ссылке (каталог/URL): мы его не храним, сжимаем один раз перед запросом.
 * Для person и образов из магазина не вызывать — они уже сжаты при сохранении.
 */
export function resizeDataUrlForApi(dataUrl: string): Promise<string> {
  return resizeToStorageFormat(dataUrl, STORAGE_MAX_DIM, STORAGE_QUALITY);
}
