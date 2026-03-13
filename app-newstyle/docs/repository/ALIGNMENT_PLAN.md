# План выравнивания перед Issue 5

Цель: привести схему БД, storage и upload к спецификации (Issues 2, 3, 4), чтобы Issue 5 делать уже на финальном контракте.

---

## Шаг 1. Миграция 002 — схема Core MVP

**Файл:** `backend/migrations/002_align_core_mvp.sql`

**Условие:** применяется после 001. Рассчитано на то, что в БД уже могли появиться данные (user_photos, media_assets). Если БД пустая — можно было бы заменить 001 одной миграцией; т.к. 001 уже в dev, делаем 002 как ALTER.

1. **media_assets**
   - Добавить: `original_url`, `preview_url`, `storage_key`, `hash`, `mime_type`, `size`, `width`, `height`, `expires_at`, `is_deleted`.
   - Для существующих строк: `original_url = url`, `preview_url = NULL`, `storage_key = NULL` (или извлечь из url), остальное NULL.
   - Переименовать: `owner_id` → `owner_user_id`.
   - Удалить колонку `url` после переноса в `original_url`.

2. **looks**
   - Добавить: `title` (TEXT), `status` (TEXT, default 'active'), `updated_at` (TIMESTAMPTZ, default now()).
   - Переименовать: `image_asset_id` → `main_asset_id`.

3. **tryon_sessions**
   - Добавить: `person_asset_id` (UUID, FK → media_assets), `provider`, `error_message`, `started_at`, `completed_at`.
   - Переименовать: `result_asset_id` → `result_image_asset_id`, `video_asset_id` → `result_video_asset_id`.
   - Перенос данных: `person_asset_id = (SELECT asset_id FROM user_photos WHERE user_photos.id = tryon_sessions.photo_id)`.
   - Удалить колонку `photo_id`, затем удалить таблицу `user_photos`.

4. **Удалить таблицы (out of scope):** `token_transactions`, `ai_generation_logs`.

5. **Индексы:** при необходимости добавить индексы по новым полям (например `owner_user_id`, `expires_at`, `is_deleted`).

**Риск:** если уже есть tryon_sessions с photo_id, миграция заполнит person_asset_id из user_photos. Если данных нет — person_asset_id останется NULL до первых новых примерок.

---

## Шаг 2. Storage — возврат url + storage_key

**Файл:** `backend/src/storage/storageService.ts`

- `uploadImage(...)` возвращать не `Promise<string>`, а `Promise<{ url: string; storageKey: string }>`.
- `storageKey` = путь в bucket (тот же, что сейчас передаётся в upload), например `users/{userId}/photos/{key}`.
- Все вызовы `uploadImage` в коде заменить на приём объекта и при необходимости сохранять `storage_key` в `media_assets`.

**Файлы, которые используют uploadImage:** `api/controllers/mediaController.ts` (и в будущем воркеры).

---

## Шаг 3. Upload (Issue 4 по спецификации)

**Файл:** `backend/src/utils/compressImage.ts` (или отдельный preview)

- Нормализация: max side **2048px** (сейчас 1536).
- Добавить генерацию превью: max side **512px**, отдельный buffer.

**Файл:** `backend/src/api/controllers/mediaController.ts`

- Загружать два файла в storage: основной (2048) и превью (512). Получить два результата `{ url, storageKey }`.
- Писать в **media_assets** одну запись: `original_url`, `preview_url`, `storage_key` (основной), `type`, `mime_type`, `size`, `width`, `height`, `owner_user_id`, остальные поля по спецификации. Не писать в `user_photos` (таблицы уже нет после 002).
- Ответ: `{ id, url, previewUrl }` (url = original_url, previewUrl = preview_url).
- Убрать из этого эндпоинта: лимит 10 и удаление самого старого (вынести в отдельную задачу).

**Идентификация пользователя:** по-прежнему X-User-Id или создание user при первом upload. `owner_user_id` в media_assets.

---

## Шаг 4. My photos (Issue 5) — список и удаление

**Файл:** `backend/src/api/controllers/mediaController.ts`

- **GET /api/my/photos:** выборка из `media_assets` где `type = 'user_photo'` и `owner_user_id = :userId`, порядок по `created_at DESC`. Формат ответа: массив `{ id, url, previewUrl, createdAt }` (url = original_url, previewUrl = preview_url).
- **DELETE /api/my/photos/:id:** проверка, что запись в media_assets с этим id имеет `owner_user_id = :userId`; удаление файла(ов) из storage по storage_key (и превью, если храним отдельно); удаление строки из media_assets.
- Не удалять чужие фото (проверка owner_user_id).

Лимит 10 и TTL — не в рамках этого шага (отдельная задача).

---

## Порядок выполнения

| # | Что делаем | Ветка / PR |
|---|------------|------------|
| 1 | Миграция 002 + автотест миграций (применяется, таблицы/индексы есть) | feature/align-schema |
| 2 | Storage: uploadImage возвращает { url, storageKey } | та же или отдельная |
| 3 | Upload: 2048+preview 512, запись в media_assets, ответ { id, url, previewUrl }; убрать user_photos и лимит 10 из upload | та же |
| 4 | GET/DELETE my photos через media_assets | та же или отдельная (Issue 5) |

После мержа выравнивания — отдельно Issue 5 (если ещё не всё внесено) и автотесты по спецификации.

---

## Автотесты (по твоим Autotester)

- **Issue 2:** миграции применяются без ошибок; таблицы users, media_assets, looks, look_likes, tryon_sessions существуют; базовые индексы и FK есть.
- **Issue 3:** upload → url + storage_key; mirrorFromUrl; deleteAsset удаляет. (Запуск в CI.)
- **Issue 4:** успешная загрузка; запись в media_assets; preview создаётся; невалидный файл отклоняется.
- **Issue 5:** пользователь видит только свои фото; удаление своего работает; удаление чужого запрещено.

Сначала добавляем тесты миграций (можно без реального Supabase — только DB). Остальные тесты — по мере внедрения шагов 2–4.
