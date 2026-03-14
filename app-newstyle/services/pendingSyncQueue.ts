const PENDING_PERSON_UPLOADS_KEY = 'tvoiisty_pending_person_uploads';

function readList(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_PERSON_UPLOADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string' && !!x) : [];
  } catch {
    return [];
  }
}

function writeList(items: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PENDING_PERSON_UPLOADS_KEY, JSON.stringify(Array.from(new Set(items)).slice(0, 20)));
  } catch {
    // ignore
  }
}

export function enqueuePendingPersonUpload(img: string): void {
  const list = readList();
  writeList([img, ...list]);
}

export function removePendingPersonUpload(img: string): void {
  const list = readList();
  writeList(list.filter((x) => x !== img));
}

export function getPendingPersonUploads(): string[] {
  return readList();
}

