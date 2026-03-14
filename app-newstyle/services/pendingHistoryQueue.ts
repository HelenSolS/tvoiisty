type PendingHistoryAction =
  | { id: string; kind: 'like'; sessionId: string; liked: boolean; createdAt: number }
  | { id: string; kind: 'delete'; sessionId: string; createdAt: number }
  | { id: string; kind: 'reanimate'; sessionId: string; createdAt: number };

const STORAGE_KEY = 'tvoiisty_pending_history_actions';

function nowId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readQueue(): PendingHistoryAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.kind === 'string' && typeof x.sessionId === 'string');
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingHistoryAction[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-200)));
  } catch {
    // ignore
  }
}

function upsert(queue: PendingHistoryAction[], action: PendingHistoryAction): PendingHistoryAction[] {
  if (action.kind === 'delete') {
    const filtered = queue.filter((q) => q.sessionId !== action.sessionId);
    return [...filtered, action];
  }
  if (action.kind === 'like') {
    const filtered = queue.filter((q) => !(q.sessionId === action.sessionId && q.kind === 'like'));
    return [...filtered, action];
  }
  const filtered = queue.filter((q) => !(q.sessionId === action.sessionId && q.kind === 'reanimate'));
  return [...filtered, action];
}

export function enqueueHistoryLike(sessionId: string, liked: boolean): void {
  const queue = readQueue();
  writeQueue(upsert(queue, { id: nowId(), kind: 'like', sessionId, liked, createdAt: Date.now() }));
}

export function enqueueHistoryDelete(sessionId: string): void {
  const queue = readQueue();
  writeQueue(upsert(queue, { id: nowId(), kind: 'delete', sessionId, createdAt: Date.now() }));
}

export function enqueueHistoryReanimate(sessionId: string): void {
  const queue = readQueue();
  writeQueue(upsert(queue, { id: nowId(), kind: 'reanimate', sessionId, createdAt: Date.now() }));
}

export function getPendingHistoryActions(): PendingHistoryAction[] {
  return readQueue();
}

export function removePendingHistoryAction(actionId: string): void {
  const queue = readQueue();
  writeQueue(queue.filter((x) => x.id !== actionId));
}

