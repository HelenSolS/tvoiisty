/**
 * Runs before any test file. Forces JWT_SECRET for integration tests so tokens
 * signed in tests are accepted by requireAuth (backend/auth.ts reads it at module
 * load time). In Docker/CI, .env sets a different secret — we override so
 * admin-settings and other auth tests pass.
 */
process.env.JWT_SECRET = 'test-secret-integration';
