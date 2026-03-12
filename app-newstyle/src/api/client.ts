const metaEnv: any = (import.meta as any)?.env ?? {};

// Единая точка правды для всех фронтовых страниц.
// В dev: ходим в локальный backend на 4000.
// В production/preview (Vercel): всегда используем боевой API https://api.tvoiistyle.top,
// либо явное значение из VITE_API_URL, если оно задано.
export const API_URL: string =
  metaEnv.VITE_API_URL ||
  (metaEnv.DEV ? 'http://localhost:4000' : 'https://api.tvoiistyle.top');

function isFormData(body: any): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

async function doFetch(path: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const mergedHeaders: Record<string, string> = {
      ...(options?.headers as Record<string, string> | undefined),
    };

    if (
      options?.body &&
      !isFormData(options.body) &&
      !Object.keys(mergedHeaders).some(
        (k) => k.toLowerCase() === 'content-type',
      )
    ) {
      mergedHeaders['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: mergedHeaders,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function api(path: string, options?: RequestInit): Promise<any> {
  const res = await doFetch(path, options);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'API error');
  }

  return res.json();
}

export async function apiRaw(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  return doFetch(path, options);
}


