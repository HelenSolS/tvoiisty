/**
 * Локальная система метрик (Issue #29). IndexedDB, без сервера.
 */

export interface AppMetrics {
  totalTryOns: number;
  totalVideos: number;
  totalShares: number;
  totalShopClicks: number;
  totalArchiveSaves: number;
  totalCollectionsCreated: number;
  totalOutfitsUploaded: number;
  firstLaunchAt: number;
}

const DB_NAME = 'tvoisty_metrics_db';
const DB_STORE = 'metrics';
const DB_KEY = 'app';

const ZERO: AppMetrics = {
  totalTryOns: 0,
  totalVideos: 0,
  totalShares: 0,
  totalShopClicks: 0,
  totalArchiveSaves: 0,
  totalCollectionsCreated: 0,
  totalOutfitsUploaded: 0,
  firstLaunchAt: 0,
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(DB_STORE, { keyPath: 'key' });
    };
  });
}

function getFromIDB(): Promise<AppMetrics> {
  return openDB().then(db => {
    return new Promise<AppMetrics>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(DB_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const raw = req.result?.value;
        db.close();
        if (raw && typeof raw === 'object') {
          resolve({ ...ZERO, ...raw, firstLaunchAt: raw.firstLaunchAt || 0 });
        } else {
          resolve({ ...ZERO, firstLaunchAt: Date.now() });
        }
      };
    });
  });
}

function putToIDB(value: AppMetrics): Promise<void> {
  return openDB().then(db => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.put({ key: DB_KEY, value });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  });
}

/** Загрузить метрики. При первом запуске firstLaunchAt = now, остальное 0. */
export function getMetrics(): Promise<AppMetrics> {
  return getFromIDB().catch(() => ({ ...ZERO, firstLaunchAt: Date.now() }));
}

type MetricKey = keyof Omit<AppMetrics, 'firstLaunchAt'>;

/** Увеличить счётчик на delta (по умолчанию 1) и сохранить. */
export async function incrementMetric(key: MetricKey, delta: number = 1): Promise<void> {
  const m = await getFromIDB().catch(() => ({ ...ZERO, firstLaunchAt: Date.now() }));
  const now = Date.now();
  if (!m.firstLaunchAt) m.firstLaunchAt = now;
  (m as Record<string, number>)[key] = ((m as Record<string, number>)[key] ?? 0) + delta;
  await putToIDB(m);
}

/** Сброс всех счётчиков для демо (firstLaunchAt обновляется). */
export async function resetMetrics(): Promise<AppMetrics> {
  const fresh = { ...ZERO, firstLaunchAt: Date.now() };
  await putToIDB(fresh);
  return fresh;
}
