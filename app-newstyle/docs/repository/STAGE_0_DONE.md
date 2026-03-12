# Stage 0 — завершён

Этап выравнивания перед основной разработкой (Issue 6 и далее) выполнен.

## Сделано

1. **Миграция 002** (`backend/migrations/002_align_core_mvp.sql`) — схема приведена к Core MVP:
   - media_assets: original_url, preview_url, storage_key, owner_user_id, и др.
   - looks: title, status, updated_at, main_asset_id
   - tryon_sessions: person_asset_id, result_image_asset_id, result_video_asset_id, provider, error_message, started_at, completed_at
   - Удалены user_photos, token_transactions, ai_generation_logs

2. **Storage и загрузка:**
   - Нормализация: макс. сторона **2048 px**, превью **512 px** (см. MEDIA_PIPELINE.md).
   - `uploadImage()` возвращает `{ url, storageKey }`.
   - Ответ API загрузки: `{ id, url, previewUrl }`.

3. **Looks API:**
   - GET /api/looks — список активных образов с imageUrl и liked (по X-User-Id).
   - POST /api/looks/:id/like — переключение лайка.

4. **Автотесты и CI:**
   - H1, S1, M1–M4, P1, P4, F1, F2, F4, тесты Looks API (см. AUTOTESTS_SPEC.md).
   - GitHub Actions: `.github/workflows/backend-ci.yml` — Postgres service, migrate, npm test.

## Дальше

**Issue 6** (очереди / try-on pipeline) — следующий приоритет после зелёных тестов в CI.
