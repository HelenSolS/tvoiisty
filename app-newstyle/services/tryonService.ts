type TryonStartParams = {
  apiBase: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export async function startTryOn({ apiBase, headers, body }: TryonStartParams): Promise<any> {
  const res = await fetch(`${apiBase}/api/tryon`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as any)?.error || `tryon-start-failed-${res.status}`);
  }
  return res.json();
}

type UploadImageParams = {
  apiBase: string;
  headers: Record<string, string>;
  formData: FormData;
};

export async function uploadImage({ apiBase, headers, formData }: UploadImageParams): Promise<any> {
  const res = await fetch(`${apiBase}/api/media/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`upload failed ${res.status}`);
  }
  return res;
}

type TryonStatusParams = {
  apiBase: string;
  sessionId: string;
  headers: Record<string, string>;
  signal: AbortSignal;
};

export async function getTryonStatus({ apiBase, sessionId, headers, signal }: TryonStatusParams): Promise<any> {
  const res = await fetch(`${apiBase}/api/tryon/${sessionId}`, {
    signal,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `tryon-status-failed-${res.status}`);
  }
  return res.json();
}

type StartVideoParams = {
  apiBase: string;
  sessionId: string;
  headers: Record<string, string>;
  signal: AbortSignal;
};

export async function startTryonVideo({ apiBase, sessionId, headers, signal }: StartVideoParams): Promise<void> {
  const res = await fetch(`${apiBase}/api/tryon/${sessionId}/video`, {
    method: 'POST',
    signal,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `video-start-failed-${res.status}`);
  }
}

type VideoStatusParams = {
  apiBase: string;
  sessionId: string;
  headers: Record<string, string>;
  signal: AbortSignal;
};

export async function getTryonVideoStatus({ apiBase, sessionId, headers, signal }: VideoStatusParams): Promise<any> {
  const res = await fetch(`${apiBase}/api/tryon/${sessionId}/video-status`, {
    signal,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `video-status-failed-${res.status}`);
  }
  return res.json();
}


