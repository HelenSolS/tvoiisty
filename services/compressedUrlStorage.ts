/**
 * Постоянное хранилище сжатых образов по URL (IndexedDB).
 * Любая картинка по URL, которая может пойти в примерку, один раз загружается,
 * сжимается и сохраняется сюда. В момент «Примерить» handler только читает по URL.
 */

const DB_NAME = 'tvoisty_compressed_urls_db';
const DB_STORE = 'compressed_urls';
const MAX_ENTRIES = 100;

interface StoredEntry {
  url: string;
  dataUrl: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(DB_STORE, { keyPath: 'url' });
    };
  });
}

/** Получить готовый base64 (data URL) по URL. Только чтение, без загрузки/ресайза. */
export function getCompressedByUrl(url: string): Promise<string | null> {
  return openDB().then(
    (db) =>
      new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const req = store.get(url);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          db.close();
          const entry = req.result as StoredEntry | undefined;
          resolve(entry?.dataUrl ?? null);
        };
      })
  ).catch(() => null);
}

/** Сохранить сжатый data URL по URL. Вызывать после загрузки и сжатия (вне handler примерки). */
export function saveCompressedByUrl(url: string, dataUrl: string): Promise<void> {
  const entry: StoredEntry = { url, dataUrl, createdAt: Date.now() };
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        store.put(entry);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      })
  ).then(() => evictIfNeeded());
}

function evictIfNeeded(): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const all = (req.result as StoredEntry[]) || [];
          if (all.length <= MAX_ENTRIES) {
            db.close();
            return resolve();
          }
          const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt);
          const toDelete = sorted.slice(0, all.length - MAX_ENTRIES);
          toDelete.forEach((e) => store.delete(e.url));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      })
  ).catch(() => {});
}
