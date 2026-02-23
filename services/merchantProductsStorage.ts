import type { CuratedOutfit } from '../types';

const DB_NAME = 'tvoisty_merchant_db';
const DB_STORE = 'merchant_products';
const DB_KEY = 'items';
const MAX_MERCHANT_PRODUCTS = 50;

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

function getFromIDB(): Promise<CuratedOutfit[]> {
  return openDB().then((db) => {
    return new Promise<CuratedOutfit[]>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(DB_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const raw = req.result?.items;
        const arr = Array.isArray(raw) ? raw : [];
        db.close();
        resolve(arr.slice(0, MAX_MERCHANT_PRODUCTS));
      };
    });
  });
}

function putToIDB(items: CuratedOutfit[]): Promise<void> {
  const limited = [...items].slice(0, MAX_MERCHANT_PRODUCTS);
  return openDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.put({ key: DB_KEY, items: limited });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  });
}

function getFromLocalStorage(localStorageKey: string): CuratedOutfit[] {
  try {
    const raw = localStorage.getItem(localStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_MERCHANT_PRODUCTS) : [];
  } catch {
    return [];
  }
}

/** Загрузить товары магазина: сначала IndexedDB, если пусто — миграция из localStorage. */
export function getMerchantProducts(localStorageKey: string): Promise<CuratedOutfit[]> {
  return getFromIDB()
    .then((arr) => {
      if (arr.length === 0) {
        const fromLs = getFromLocalStorage(localStorageKey);
        if (fromLs.length > 0) {
          putToIDB(fromLs).catch(() => {});
          return fromLs;
        }
      }
      return arr;
    })
    .catch(() => getFromLocalStorage(localStorageKey));
}

/** Сохранить товары магазина в IndexedDB (один источник правды). */
export function saveMerchantProducts(
  items: CuratedOutfit[],
  _localStorageKey: string,
): Promise<void> {
  return putToIDB(items).catch(() => {});
}

