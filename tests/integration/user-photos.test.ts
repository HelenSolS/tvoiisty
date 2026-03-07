// Issue 52 — User Photos Storage Model
// NOTE: Backend endpoints for user photos are not implemented yet.
// These tests document the expected behaviour and should be filled in
// once /api/user/photos endpoints exist.

import { describe, test } from 'vitest';

describe('Issue 52 — User Photos Storage API (spec)', () => {
  test.todo('Upload 1 photo → appears in list, becomes default');
  test.todo('Upload 10 photos → all ok');
  test.todo('Upload 11th photo → 409 LIMIT_REACHED and nothing added');
  test.todo('Set default switches default photo and persists across reload');
  test.todo('Delete photo used in tryon_sessions → is_active=false, history stays valid');
  test.todo('User cannot manage photos of another user (403/404)');
});

