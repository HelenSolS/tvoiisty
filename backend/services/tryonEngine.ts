/**
 * Единая точка входа для Try-On (Issue #72).
 * Вся логика выбора primary, fallback и политики ошибок — через ProviderRouter и адаптеры.
 * Route только валидирует вход, собирает TryOnRequest и вызывает execute().
 */

import type { TryOnRequest, TryOnResult, ProviderExecutionResult } from './tryonTypes.js';
import { isFallbackAllowedForResult } from './tryonTypes.js';
import { getPrimaryProvider, getFallbackProvider, hasAnyProvider } from './providerRouter.js';
import { executeKieTryOn } from '../providers/kieTryonProvider.js';
import { executeFalTryOn } from '../providers/falTryonProvider.js';

function runProvider(provider: 'kie' | 'fal', request: TryOnRequest): Promise<ProviderExecutionResult> {
  if (provider === 'kie') return executeKieTryOn(request);
  return executeFalTryOn(request);
}

export async function execute(request: TryOnRequest): Promise<TryOnResult> {
  if (!hasAnyProvider()) {
    return {
      success: false,
      errorType: 'validation',
      errorMessage: 'Нужен хотя бы один ключ: KIE_API_KEY или FAL_KEY.',
      failedProvider: undefined,
      wasFallback: false,
    };
  }

  const primary = await getPrimaryProvider();
  const fallback = getFallbackProvider(primary);

  let primaryResult = await runProvider(primary, request);

  if (primary === 'fal' && !primaryResult.success && primaryResult.errorType === 'network') {
    console.warn('[tryonEngine] Fal network error, retry once');
    primaryResult = await runProvider(primary, request);
  }

  if (primaryResult.success) {
    return { success: true, imageUrl: primaryResult.imageUrl, providerUsed: primary };
  }

  if (!fallback || !isFallbackAllowedForResult(primaryResult, primary)) {
    return {
      success: false,
      errorType: primaryResult.errorType,
      errorMessage: primaryResult.errorMessage,
      failedProvider: primary,
      wasFallback: false,
    };
  }

  console.warn(`[tryonEngine] ${primary} failed, fallback to ${fallback}:`, primaryResult.errorMessage);
  const fallbackResult = await runProvider(fallback, request);
  if (fallbackResult.success) {
    return { success: true, imageUrl: fallbackResult.imageUrl, providerUsed: fallback };
  }

  return {
    success: false,
    errorType: fallbackResult.errorType,
    errorMessage: fallbackResult.errorMessage,
    failedProvider: fallback,
    wasFallback: true,
  };
}
