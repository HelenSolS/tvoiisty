const API_BASE = '';

export interface UserPreferences {
  theme?: 'turquoise' | 'lavender' | 'peach';
  showModelSelector?: boolean;
  preferredScene?: string;
  defaultImageModel?: string;
}

function getAuthToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const token = localStorage.getItem('tvoisty_auth_token');
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export async function fetchUserPreferences(): Promise<UserPreferences | null> {
  const token = getAuthToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/api/user/settings`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) return null;

  let data: any;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  if (!res.ok) return null;

  return (data?.preferences ?? null) as UserPreferences | null;
}

export async function updateUserPreferences(partial: UserPreferences): Promise<UserPreferences | null> {
  const token = getAuthToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/api/user/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preferences: partial }),
  });

  if (res.status === 401) return null;

  let data: any;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  if (!res.ok) return null;

  return (data?.preferences ?? null) as UserPreferences | null;
}

