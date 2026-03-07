/**
 * Типы для Try-On Engine (Issue #72).
 * Нормализация ошибок провайдеров и контракт между route → engine → router → adapters.
 */

export type ProviderId = 'kie' | 'fal';

/** Вход в движок: только URL и опции. Разрешение asset_id → URL остаётся в route. */
export interface TryOnRequest {
  personUrl: string;
  clothingUrl: string;
  modelName?: string;
}

/** Нормализованные типы ошибок провайдера (для политики fallback). */
export type ProviderErrorType =
  | 'timeout'
  | 'invalid_response'
  | 'auth'
  | 'rate_limit'
  | 'provider_error'
  | 'validation';

/** Результат выполнения одного провайдера. Провайдеры не вызывают друг друга. */
export type ProviderExecutionResult =
  | { success: true; imageUrl: string; provider: ProviderId }
  | {
      success: false;
      provider: ProviderId;
      errorType: ProviderErrorType;
      errorMessage: string;
      /** При timeout Fal резерв (KIE) не вызываем. */
      isTimeout?: boolean;
    };

/** Итог движка: успех с URL или ошибка с типом и сообщением. */
export type TryOnResult =
  | { success: true; imageUrl: string; providerUsed?: ProviderId }
  | { success: false; errorType: ProviderErrorType; errorMessage: string };

/** Политика роутера: на каких типах ошибок разрешён fallback. */
export const FALLBACK_ALLOWED_ERROR_TYPES: ProviderErrorType[] = [
  'invalid_response',
  'auth',
  'rate_limit',
  'provider_error',
  'validation',
];

/** Таймаут никогда не даёт fallback при primary=Fal (как в lib/generate-image-router). */
export function isFallbackAllowedForResult(
  result: ProviderExecutionResult,
  primary: ProviderId,
): boolean {
  if (result.success) return false;
  if (result.isTimeout === true && primary === 'fal') return false;
  return FALLBACK_ALLOWED_ERROR_TYPES.includes(result.errorType);
}
