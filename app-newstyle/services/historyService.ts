import type { LookHistoryItem } from '../types';

type ApiCtx = {
  apiBase: string;
  headers: Record<string, string>;
};

export async function setHistoryLike(
  ctx: ApiCtx,
  sessionId: string,
  liked: boolean,
): Promise<void> {
  const res = await fetch(`${ctx.apiBase}/api/history/${encodeURIComponent(sessionId)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ctx.headers },
    body: JSON.stringify({ liked }),
  });
  if (!res.ok) throw new Error(`history-like-failed-${res.status}`);
}

export async function deleteHistoryItem(ctx: ApiCtx, sessionId: string): Promise<void> {
  const res = await fetch(`${ctx.apiBase}/api/history/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: ctx.headers,
  });
  if (!res.ok) throw new Error(`history-delete-failed-${res.status}`);
}

export async function reanimateHistoryItem(
  ctx: ApiCtx,
  sessionId: string,
): Promise<{ videoUrl: string }> {
  const res = await fetch(`${ctx.apiBase}/api/history/${encodeURIComponent(sessionId)}/reanimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ctx.headers },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`history-reanimate-failed-${res.status}`);
  const data = await res.json().catch(() => ({}));
  const videoUrl = String(data?.videoUrl || '');
  if (!videoUrl) throw new Error('history-reanimate-empty-video-url');
  return { videoUrl };
}

export async function markHistoryViewed(ctx: ApiCtx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await fetch(`${ctx.apiBase}/api/history/viewed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ctx.headers },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`history-viewed-failed-${res.status}`);
}

export function normalizeHistoryRows(rows: any[]): LookHistoryItem[] {
  return rows
    .map((x: any) => ({
      id: String(x.sessionId),
      imageUrl: String(x.imageUrl || ''),
      videoUrl: x.videoUrl ? String(x.videoUrl) : undefined,
      timestamp:
        x.createdAt
          ? (typeof x.createdAt === 'string' ? Date.parse(x.createdAt) : Number(x.createdAt)) || Date.now()
          : Date.now(),
      liked: !!x.liked,
      isNew: !!x.isNew,
    }))
    .filter((x: LookHistoryItem) => !!x.imageUrl);
}

