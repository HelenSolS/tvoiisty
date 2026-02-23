import type { HistoryItem } from '../types';

/** Единственный источник лимита архива. Использовать везде вместо магического числа. */
export const ARCHIVE_MAX_ITEMS = 50;

const DB_NAME = 'tvoisty_history_db';
const DB_STORE = 'history';
const DB_KEY = 'items';

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

function getFromIDB(): Promise<HistoryItem[]> {
  return openDB().then(db => {
    return new Promise<HistoryItem[]>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(DB_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const raw = req.result?.items;
        const arr = Array.isArray(raw) ? raw : [];
        db.close();
        resolve(arr.slice(0, ARCHIVE_MAX_ITEMS));
      };
    });
  });
}

function putToIDB(items: HistoryItem[]): Promise<void> {
  const sorted = [...items]
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, ARCHIVE_MAX_ITEMS);
  return openDB().then(db => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.put({ key: DB_KEY, items: sorted });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  });
}

function getFromLocalStorage(localStorageKey: string): HistoryItem[] {
  try {
    const raw = localStorage.getItem(localStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, ARCHIVE_MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

/**
 * Load history: IndexedDB first; if empty or fails, use localStorage (migration).
 * After migration from localStorage we write to IDB so next load uses IDB only.
 * localStorageKey should match App's `${STORAGE_VER}_history`.
 */
export function getHistory(localStorageKey: string): Promise<HistoryItem[]> {
  return getFromIDB()
    .then(arr => {
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

/**
 * Save history: sort by timestamp, keep last ARCHIVE_MAX_ITEMS, write only to IndexedDB.
 * localStorage не используется — один источник правды (IDB).
 */
export function saveHistory(items: HistoryItem[], _localStorageKey: string): Promise<void> {
  const sorted = [...items]
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, ARCHIVE_MAX_ITEMS);
  return putToIDB(sorted).catch(() => {});
}
