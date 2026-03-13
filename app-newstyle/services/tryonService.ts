import type { TryOnRequest } from '../types/TryOnRequest';
import type {
  TryOnStartResponse,
  TryOnStatusResponse,
  TryOnVideoStatusResponse,
} from '../types/TryOnResponse';

type TryonStartParams = {
  apiBase: string;
  headers: Record<string, string>;
  body: TryOnRequest;
};

export async function startTryOn({ apiBase, headers, body }: TryonStartParams): Promise<TryOnStartResponse> {
  const res = await fetch(`${apiBase}/api/tryon`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as any)?.error || `tryon-start-failed-${res.status}`);
  }
  return res.json() as Promise<TryOnStartResponse>;
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

type TryonLiteParams = {
  apiBase: string;
  person: Blob;
  garment: Blob;
  headers?: Record<string, string>;
};

export async function startTryOnLite({ apiBase, person, garment, headers }: TryonLiteParams): Promise<{ imageUrl: string; sessionId?: string }> {
  const form = new FormData();
  form.append('person', person, 'person.jpg');
  form.append('garment', garment, 'garment.jpg');

  const res = await fetch(`${apiBase}/api/tryon-lite`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `tryon-lite-start-failed-${res.status}`);
  }

  const data = await res.json().catch(() => ({}));
  const imageUrl = (data?.image_url ?? data?.imageUrl ?? '').toString();
  if (!imageUrl) {
    throw new Error('no-image-url');
  }
  const sessionId = (data?.session_id ?? data?.sessionId ?? '').toString();
  return { imageUrl, ...(sessionId ? { sessionId } : {}) };
}

type StartVideoFromImageParams = {
  apiBase: string;
  imageUrl: string;
  headers?: Record<string, string>;
};

export async function startVideoFromImage({ apiBase, imageUrl, headers }: StartVideoFromImageParams): Promise<{ videoUrl: string }> {
  const res = await fetch(`${apiBase}/api/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify({ imageUrl }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `video-start-failed-${res.status}`);
  }

  const data = await res.json().catch(() => ({}));
  const videoUrl = (data?.videoUrl ?? '').toString();
  if (!videoUrl) {
    throw new Error('no-video-url');
  }
  return { videoUrl };
}

type TryonStatusParams = {
  apiBase: string;
  sessionId: string;
  headers: Record<string, string>;
  signal: AbortSignal;
};

export async function getTryonStatus({ apiBase, sessionId, headers, signal }: TryonStatusParams): Promise<TryOnStatusResponse> {
  const res = await fetch(`${apiBase}/api/tryon/${sessionId}`, {
    signal,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `tryon-status-failed-${res.status}`);
  }
  return res.json() as Promise<TryOnStatusResponse>;
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

export async function getTryonVideoStatus({ apiBase, sessionId, headers, signal }: VideoStatusParams): Promise<TryOnVideoStatusResponse> {
  const res = await fetch(`${apiBase}/api/tryon/${sessionId}/video-status`, {
    signal,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `video-status-failed-${res.status}`);
  }
  return res.json() as Promise<TryOnVideoStatusResponse>;
}


