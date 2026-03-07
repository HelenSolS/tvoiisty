/**
 * Адаптер Fal для Try-On Engine (Issue #72).
 * Принимает TryOnRequest (URL), возвращает ProviderExecutionResult.
 * Не вызывает KIE и не знает о fallback.
 */

import { tryOnWithFal } from '../falClient.js';
import type { TryOnRequest, ProviderExecutionResult, ProviderErrorType } from '../services/tryonTypes.js';

function normalizeFalError(err: unknown): { errorType: ProviderErrorType; message: string; isTimeout?: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const isFalTimeout = (err as Error & { isFalTimeout?: boolean })?.isFalTimeout === true;
  if (isFalTimeout || msg.includes('время ожидания') || msg.includes('Превышено время')) {
    return { errorType: 'timeout', message: msg, isTimeout: true };
  }
  if (msg.includes('неверный ответ') || msg.includes('не вернул') || msg.includes('invalid')) {
    return { errorType: 'invalid_response', message: msg };
  }
  if (msg.includes('FAL_KEY') || msg.includes('не задан') || msg.includes('ключ')) {
    return { errorType: 'auth', message: msg };
  }
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate')) {
    return { errorType: 'rate_limit', message: msg };
  }
  if (msg.includes('генерация не удалась') || msg.includes('FAILED')) {
    return { errorType: 'provider_error', message: msg };
  }
  return { errorType: 'provider_error', message: msg };
}

export async function executeFalTryOn(request: TryOnRequest): Promise<ProviderExecutionResult> {
  try {
    const imageUrl = await tryOnWithFal(request.personUrl, request.clothingUrl);
    return { success: true, imageUrl, provider: 'fal' };
  } catch (err) {
    const { errorType, message, isTimeout } = normalizeFalError(err);
    return {
      success: false,
      provider: 'fal',
      errorType,
      errorMessage: message,
      isTimeout,
    };
  }
}
