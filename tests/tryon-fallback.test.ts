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

describe('TryOn fallback: Fal → KIE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('when primary is fal and Fal fails (non-timeout), fallback to KIE and result has providerUsed === "kie"', async () => {
    const result = await execute(mockRequest);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imageUrl).toBe('https://example.com/result.png');
      expect(result.providerUsed).toBe('kie');
    }
  });
});
