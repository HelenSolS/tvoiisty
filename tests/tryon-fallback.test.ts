/**
 * ISSUE 4 — Проверка fallback логики: primary Fal, при ошибке Fal → fallback KIE.
 * Тест не меняет production env; используются mock провайдеры.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TryOnRequest, ProviderExecutionResult } from '../backend/services/tryonTypes.js';
import { execute } from '../backend/services/tryonEngine.js';

const mockRequest: TryOnRequest = {
  personUrl: 'https://example.com/person.png',
  clothingUrl: 'https://example.com/clothing.png',
};

vi.mock('../backend/services/providerRouter.js', () => ({
  getPrimaryProvider: vi.fn().mockResolvedValue('fal'),
  getFallbackProvider: vi.fn((primary: string) => (primary === 'fal' ? 'kie' : null)),
  hasAnyProvider: vi.fn().mockReturnValue(true),
}));

vi.mock('../backend/providers/falTryonProvider.js', () => ({
  executeFalTryOn: vi.fn().mockResolvedValue({
    success: false,
    provider: 'fal',
    errorType: 'provider_error',
    errorMessage: 'FAL_KEY broken (mocked)',
  } as ProviderExecutionResult),
}));

vi.mock('../backend/providers/kieTryonProvider.js', () => ({
  executeKieTryOn: vi.fn().mockResolvedValue({
    success: true,
    imageUrl: 'https://example.com/result.png',
    provider: 'kie',
  } as ProviderExecutionResult),
}));

describe('TryOn fallback: Fal → KIE (canon)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('when primary is fal and Fal fails (provider_error), fallback to KIE and result has providerUsed === "kie"', async () => {
    const result = await execute(mockRequest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imageUrl).toBe('https://example.com/result.png');
      expect(result.providerUsed).toBe('kie');
    }
  });

  it('when primary is fal and Fal fails with rate_limit (quota/tokens), fallback to KIE and return KIE image', async () => {
    const { executeFalTryOn } = await import('../backend/providers/falTryonProvider.js');
    vi.mocked(executeFalTryOn).mockResolvedValueOnce({
      success: false,
      provider: 'fal',
      errorType: 'rate_limit',
      errorMessage: 'Fal 402 (quota/rate): Insufficient credits',
    } as ProviderExecutionResult);

    const result = await execute(mockRequest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.providerUsed).toBe('kie');
      expect(result.imageUrl).toBe('https://example.com/result.png');
    }
  });

  it('when primary is fal and Fal fails with timeout, no fallback — return Fal error', async () => {
    const { executeFalTryOn } = await import('../backend/providers/falTryonProvider.js');
    vi.mocked(executeFalTryOn).mockResolvedValueOnce({
      success: false,
      provider: 'fal',
      errorType: 'timeout',
      errorMessage: 'Превышено время ожидания Fal.',
      isTimeout: true,
    } as ProviderExecutionResult);

    const result = await execute(mockRequest);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('время ожидания');
    const { executeKieTryOn } = await import('../backend/providers/kieTryonProvider.js');
    expect(executeKieTryOn).not.toHaveBeenCalled();
  });
});
