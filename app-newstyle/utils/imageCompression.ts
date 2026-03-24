/**
 * Client-side image compression via Canvas API.
 * Max side 1536px, JPEG quality 0.82.
 * Used before upload and before saving result to history.
 */

const MAX_SIDE = 1536;
const JPEG_QUALITY = 0.82;

/** Compress a File/Blob to a smaller JPEG Blob. */
export async function compressImageFile(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(drawAndCompress(img));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('compress-load-failed')); };
    img.src = url;
  });
}

/** Fetch a remote image URL and compress it. Returns compressed Blob or null on error. */
export async function compressImageUrl(imageUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return compressImageFile(blob);
  } catch {
    return null;
  }
}

/** Compress a remote image URL and return a local object URL for display/storage. */
export async function compressImageUrlToObjectUrl(imageUrl: string): Promise<string> {
  const blob = await compressImageUrl(imageUrl);
  if (!blob) return imageUrl; // fallback to original if compression fails
  return URL.createObjectURL(blob);
}

/** Compress a Blob to base64 JPEG string. */
export async function compressImageToBase64(file: File | Blob): Promise<string> {
  const compressed = await compressImageFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}

function drawAndCompress(img: HTMLImageElement): Blob {
  let { naturalWidth: w, naturalHeight: h } = img;
  if (w > MAX_SIDE || h > MAX_SIDE) {
    const ratio = Math.min(MAX_SIDE / w, MAX_SIDE / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-ctx-unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return dataUrlToBlob(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
