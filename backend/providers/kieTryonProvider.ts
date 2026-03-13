/**
 * Адаптер KIE для Try-On Engine (Issue #72).
 * Принимает TryOnRequest (URL), возвращает ProviderExecutionResult.
 * Не вызывает Fal и не знает о fallback.
 */

import { generateImageTryOn } from '../kieClient.js';
import type { TryOnRequest, ProviderExecutionResult, ProviderErrorType } from '../services/tryonTypes.js';

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать изображение: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function normalizeKieError(err: unknown): { errorType: ProviderErrorType; message: string; isTimeout?: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('время ожидания') || msg.includes('Превышено время')) {
    return { errorType: 'timeout', message: msg, isTimeout: true };
  }
  if (msg.includes('taskId') || msg.includes('не вернул') || msg.includes('invalid')) {
    return { errorType: 'invalid_response', message: msg };
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('авториз') || msg.includes('ключ')) {
    return { errorType: 'auth', message: msg };
  }
  if (msg.includes('429') || msg.includes('quota') || msg.includes('квот')) {
    return { errorType: 'rate_limit', message: msg };
  }
  if (msg.includes('Не удалось скачать') || msg.includes('validation')) {
    return { errorType: 'validation', message: msg };
  }
  return { errorType: 'provider_error', message: msg };
}

export async function executeKieTryOn(request: TryOnRequest): Promise<ProviderExecutionResult> {
  try {
    const [personBase64, clothingBase64] = await Promise.all([
      fetchAsBase64(request.personUrl),
      fetchAsBase64(request.clothingUrl),
    ]);
    const imageUrl = await generateImageTryOn(
      personBase64,
      clothingBase64,
      undefined,
      request.modelName,
    );
    return { success: true, imageUrl, provider: 'kie' };
  } catch (err) {
    const { errorType, message, isTimeout } = normalizeKieError(err);
    return {
      success: false,
      provider: 'kie',
      errorType,
      errorMessage: message,
      isTimeout,
    };
  }
}
