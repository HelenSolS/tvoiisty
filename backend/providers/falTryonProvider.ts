/**
 * Адаптер Fal для Try-On Engine (Issue #72).
 * Принимает TryOnRequest (URL), возвращает ProviderExecutionResult.
 * Не вызывает KIE и не знает о fallback.
 */

import { tryOnWithFal } from '../falClient.js';
import type { TryOnRequest, ProviderExecutionResult, ProviderErrorType } from '../services/tryonTypes.js';

function normalizeFalError(err: unknown): { errorType: ProviderErrorType; message: string; isTimeout?: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  const isFalTimeout = (err as Error & { isFalTimeout?: boolean })?.isFalTimeout === true;
  if (isFalTimeout || m.includes('время ожидания') || m.includes('превышено время')) {
    return { errorType: 'timeout', message: msg, isTimeout: true };
  }
  if (m.includes('fetch') || m.includes('network') || m.includes('econnreset') || m.includes('socket') || m.includes('enotfound') || m.includes('etimedout')) {
    return { errorType: 'network', message: msg };
  }
  if (msg.includes('неверный ответ') || msg.includes('не вернул') || m.includes('invalid')) {
    return { errorType: 'invalid_response', message: msg };
  }
  if (msg.includes('FAL_KEY') || msg.includes('не задан') || msg.includes('ключ')) {
    return { errorType: 'auth', message: msg };
  }
  if (msg.includes('429') || msg.includes('402') || msg.includes('quota') || msg.includes('rate') || msg.includes('token') || msg.includes('credit') || msg.includes('insufficient')) {
    return { errorType: 'rate_limit', message: msg };
  }
  if (msg.includes('генерация не удалась') || msg.includes('FAILED')) {
    return { errorType: 'provider_error', message: msg };
  }
  return { errorType: 'provider_error', message: msg };
}

const FAL_TRYON_MODEL_DEFAULT = 'fal-ai/nano-banana-pro/edit';

/** Канон: для примерки только nano-banana. Любое упоминание virtual-try-on (любой регистр) — подменяем. */
function effectiveTryonModel(name?: string | null): string {
  const s = (name ?? '').trim().toLowerCase();
  if (s.includes('virtual-try-on') || s.includes('image-apps-v2')) return FAL_TRYON_MODEL_DEFAULT;
  return s ? name!.trim() : FAL_TRYON_MODEL_DEFAULT;
}

export async function executeFalTryOn(request: TryOnRequest): Promise<ProviderExecutionResult> {
  try {
    const model = effectiveTryonModel(request.modelName);
    const imageUrl = await tryOnWithFal(request.personUrl, request.clothingUrl, model, request.prompt);
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
