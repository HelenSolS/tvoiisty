const OWNER_CLIENT_ID_KEY = 'tvoiisty_owner_client_id';

function createClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateOwnerClientId(): string {
  if (typeof window === 'undefined') return 'guest_server';
  const existing = localStorage.getItem(OWNER_CLIENT_ID_KEY);
  if (existing && existing.trim()) return existing.trim();
  const generated = createClientId();
  localStorage.setItem(OWNER_CLIENT_ID_KEY, generated);
  return generated;
}

export function getOwnerHeaders(ownerClientId: string | null, token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (ownerClientId) {
    headers['X-Client-Id'] = ownerClientId;
    // Backward compatibility with old frontend/backend calls.
    headers['X-User-Id'] = ownerClientId;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function readOwnerClientIdFromResponse(res: Response): string | null {
  const fromClient = res.headers.get('x-client-id');
  if (fromClient && fromClient.trim()) return fromClient.trim();
  const fromCompat = res.headers.get('x-user-id');
  if (fromCompat && fromCompat.trim()) return fromCompat.trim();
  return null;
}

