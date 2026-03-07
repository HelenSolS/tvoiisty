import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-integration.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
  },
});

