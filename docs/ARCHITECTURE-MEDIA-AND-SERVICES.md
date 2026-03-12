# Архитектура: фото, образы, результаты примерки и видео (новый интерфейс)

Описание сервисов, хранилищ, БД и внешних API — только для текущего (нового) интерфейса.

---

## 1. Обзор потоков данных

| Сущность | Откуда | Куда попадает | Кто использует |
|----------|--------|---------------|-----------------|
| **Фото пользователя** | Загрузка через фронт | Storage → `media_assets` (type=person) → опционально `ai_analyses` | Примерка (person_asset_id → original_url) |
| **Образ одежды** | Загрузка или образ из витрины (look) | Storage → `media_assets` (type=person/clothing/location) или только URL в карточке | Примерка: `look_id` → looks.main_asset_id → url, либо `clothing_image_url` (URL) |
| **Результат примерки (картинка)** | Fal или KIE | Сначала mirror в Storage → `media_assets` (tryon_result_image); при сбое storage — только `result_meta.image_url` в tryon_sessions | GET /api/tryon/:id → image_url из asset или result_meta |
| **Видео по результату примерки** | KIE Veo | URL возвращается клиенту; в БД пока не сохраняем (result_video_asset_id есть в схеме, но не заполняется в текущем потоке) | POST /api/generate-video → videoUrl в ответе |

---

## 2. Хранилище файлов (Storage)

**Код:** `backend/storage.ts`

- **Типы объектов:** `person` | `clothing` | `location` | `tryon_result_image` | `tryon_result_video`
- **Выбор бэкенда:**
  - Если заданы `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` — используется **Supabase Storage** (bucket из `SUPABASE_BUCKET`, по умолчанию `media`). При ошибке — fallback на Vercel Blob, если задан `BLOB_READ_WRITE_TOKEN`.
  - Иначе — **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`).
- **Правила:**
  - Все загрузки идут через `uploadBuffer()` или `mirrorFromUrl()` (для результата провайдера).
  - Путь в storage: `media/{type}/{timestamp}-{filename}`.
  - На фронт отдаётся только **публичный URL** (Supabase public URL или Blob URL с `access: 'public'`).

**Внешние сервисы хранилища:**

| Сервис | Переменные | Назначение |
|--------|------------|------------|
| Supabase Storage | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | Основное хранилище медиа (приоритет при наличии) |
| Vercel Blob | `BLOB_READ_WRITE_TOKEN` | Хранилище медиа (основное, если Supabase не настроен; fallback при сбое Supabase) |

---

## 3. База данных (PostgreSQL)

**Подключение:** `backend/db.js` → `pool`. Схема создаётся через `ensure*()` при старте или через `scripts/init-db.sql`.

### 3.1. Таблицы, связанные с медиа и примеркой

| Таблица | Назначение | Ключевые поля |
|---------|------------|----------------|
| **media_assets** | Единый реестр всех загруженных/отзеркаленных медиа | `id`, `type`, `original_url`, `storage_key`, `hash`, `mime_type`. UNIQUE(hash, type) — дедупликация по хешу и типу. |
| **ai_analyses** | Результаты LLM-анализа фото (модерация, описание, метаданные) | `asset_id` → media_assets, `analysis_type`, `status`, `result` (JSONB). Один успешный анализ на пару (asset_id, analysis_type). |
| **looks** | Образы витрины (одежда) | `store_id`, `title`, `main_asset_id` → media_assets. Одежда для примерки по look_id берётся как `media_assets.original_url` по `looks.main_asset_id`. |
| **tryon_sessions** | Сессии примерки | `person_asset_id`, `look_id`, `result_image_asset_id` → media_assets; `result_meta` (JSONB) — при сбое mirror храним `image_url` от провайдера. |
| **users** | Пользователи (auth) | Используются для `tryon_sessions.user_id`, токенов, лайков. |
| **token_transactions** | Списание токенов за примерки | `user_id`, `tryon_session_id`, `amount`. |
| **app_settings** | Глобальные настройки (модели, лимиты) | Ключ-значение (JSONB). |
| **ai_generation_logs** | Логи вызовов генерации (картинка/видео) | `kind`, `provider`, `model`, `duration_ms`, `status`. |

### 3.2. Правила обращения к БД

- **Чтение URL для примерки:** по `person_asset_id` и при наличии `look_id` — JOIN looks + media_assets; при `clothing_image_url` — URL из тела запроса, в БД не сохраняется в рамках tryon.
- **Запись результата примерки:** при успешном mirror — создаётся запись в `media_assets` (tryon_result_image), в `tryon_sessions` заполняются `result_image_asset_id`, `result_meta`; при сбое mirror — только `result_meta.image_url`, без нового asset.
- **Дедупликация загрузок:** перед записью в storage проверяется `findAssetByHash(type, hash)`; при совпадении возвращается существующий asset без повторной загрузки и без повторного LLM-анализа.

---

## 4. Внешние сервисы (по назначению)

### 4.1. Примерка (try-on) — картинка

**Эндпоинт:** только `POST /api/tryon`. Пайплайн: backend → Fal (primary) → при ошибке/сети retry Fal 1 раз → fallback KIE.

| Сервис | Переменные | Роль |
|--------|------------|------|
| **Fal** | `FAL_KEY` | Primary: модель `fal-ai/nano-banana-pro/edit`. Таймаут опроса 70 с. Virtual-try-on подменяется на nano-banana только в tryon-пайплайне. |
| **KIE** | `KIE_API_KEY`, `KIE_BASE_URL` | Fallback примерки (nano-banana). createTask + polling recordInfo. |

- **Правило:** подмена модели virtual-try-on → nano-banana выполняется только в tryon (routes/tryon, falTryonProvider, falClient.tryOnWithFal). Видео и другие эндпоинты генерации её не используют.

### 4.2. Генерация картинки (отдельный эндпоинт, не примерка)

**Эндпоинт:** `POST /api/generate-image`. Используется для сценария «person + clothing в base64 → одна картинка». Не путать с примеркой.

| Сервис | Переменные | Роль |
|--------|------------|------|
| **KIE** | `KIE_API_KEY`, `KIE_BASE_URL` | Единственный провайдер: createImageTask + pollImageTask. Модель из тела запроса или `DEFAULT_IMAGE_MODEL` / `KIE_IMAGE_MODEL`. |

### 4.3. Генерация видео по картинке

**Эндпоинт:** `POST /api/generate-video`. Вход: `imageUrl` (обычно URL результата примерки).

| Сервис | Переменные | Роль |
|--------|------------|------|
| **KIE** | `KIE_API_KEY`, `KIE_BASE_URL` | Veo: createVideoTask (veo/generate) + pollVideoTask (veo/record-info). Модель в запросе (например veo3_fast). |

- Результат — `videoUrl` в ответе; в текущей реализации результат видео не сохраняется в storage и не пишется в `result_video_asset_id`.

### 4.4. Анализ фото (модерация, описание, метаданные)

**Запуск:** асинхронно после загрузки медиа через `enqueuePhotoAnalysis()` в `backend/aiPhotoPipeline.ts`. Тип анализа: `photo_llm_v1`.

| Сервис | Переменные | Роль |
|--------|------------|------|
| **OpenRouter** | `OPENROUTER_API_KEY` | Чат-модель для анализа изображения по URL. Модель по умолчанию: `google/gemini-2.5-flash-lite`, fallback: mistralai/mistral-small, meta-llama/llama-3.1-8b-instruct. |

- Результат пишется в `ai_analyses` (status, result JSONB). Повторный анализ для того же (asset_id, analysis_type) не делается при уже успешной записи.

---

## 5. Сервисы бэкенда (кто когда вызывается)

| Действие | Маршрут/модуль | Storage | БД | Внешний API |
|----------|----------------|--------|-----|-------------|
| Загрузка фото/одежды/локации | POST /api/media/upload (uploadMedia.ts) | uploadBuffer (Supabase или Blob) | findAssetByHash → при отсутствии findOrCreateAssetByHash; enqueuePhotoAnalysis | — |
| Примерка | POST /api/tryon (tryon.ts → tryonEngine) | mirrorFromUrl при успехе провайдера; при ошибке — только result_meta | createPendingTryon, markTryonProcessing, createMediaAsset или markTryonCompletedWithImageUrl, markTryonCompleted/markTryonFailed, incrementTryonCount, logTryonTokenCharge | Fal → (retry при network) → KIE fallback |
| Статус примерки / картинка | GET /api/tryon/:id | — | findTryonById; при наличии result_image_asset_id — media_assets.original_url; иначе result_meta.image_url | — |
| Генерация картинки (KIE) | POST /api/generate-image | — | logAiGeneration | KIE createTask + polling |
| Генерация видео | POST /api/generate-video | — | logAiGeneration | KIE veo/generate + polling |
| Очередь анализа фото | aiPhotoPipeline (фоново после upload) | — | getExistingSuccessfulAnalysis, INSERT/UPDATE ai_analyses | OpenRouter (Gemini и др.) |

---

## 6. Очередь задач (как есть)

В системе есть **одна очередь** — только для анализа загруженных фото (модерация, описание, метаданные). Отдельной очереди для примерки или видео нет.

**Где:** `backend/aiPhotoPipeline.ts` (Express).

**Как устроена:**
- **In-memory очередь:** массив `AnalysisJob[]` (assetId, type, analysisType). Периодичность не задаётся — задачи обрабатываются подряд в одном процессе.
- **Постановка в очередь:** после успешной загрузки файла в `uploadMediaHandler` вызывается `enqueuePhotoAnalysis({ assetId, type, analysisType: 'photo_llm_v1' })`. Ответ пользователю отдаётся сразу, обработка идёт в фоне.
- **Обработка:** один фоновый цикл `processQueue()`: пока в очереди есть элементы — забирает задачу, проверяет кеш в `ai_analyses` (уже успешный анализ по asset_id + analysis_type), при отсутствии — вызывает OpenRouter (Gemini и др.), результат пишет в `ai_analyses`.
- **Персистентность:** очередь не сохраняется в БД/Redis. При перезапуске процесса необработанные задачи теряются; повторная загрузка того же файла (тот же hash) даёт тот же asset и при следующем запросе анализа задача может быть поставлена снова.
- **Примерка и видео** в очередь не ставятся: примерка выполняется в том же запросе (async IIFE после создания сессии), видео — синхронный вызов KIE в рамках POST /api/generate-video.

Отдельный Worker, Redis, Bull и т.п. в текущей реализации не используются.

---

## 7. Правила обращения к сервисам и хранилищам

1. **Storage:** все записи медиа только через `backend/storage.ts` (uploadBuffer или mirrorFromUrl). Тип всегда один из: person, clothing, location, tryon_result_image, tryon_result_video.
2. **БД:** доступ к медиа только через `backend/media.ts` (findAssetByHash, findOrCreateAssetByHash, createMediaAsset). Tryon-сессии — через `backend/tryonSessions.ts`. Не обходить эти модули прямыми запросами к таблицам медиа/сессий из роутов.
3. **Fal:** вызов только из tryon-цепи (falTryonProvider → falClient.tryOnWithFal). Таймаут 70 с; на фронте polling примерки не менее 90 с.
4. **KIE:** вызовы из tryon (fallback), generate-image и generate-video. Ключ и base URL только в backend (config.ts, kieClient.ts), на фронт не передаются.
5. **URL провайдера (Fal/KIE):** основной источник картинки для пользователя — mirror в наше хранилище. `result_meta.image_url` — только при сбое mirror; у провайдера URL может иметь ограниченный TTL.
7. **Ошибки для пользователя:** при сбое примерки клиенту отдаётся нейтральное сообщение (например из TRYON_USER_FACING_ERROR); детали только в логах сервера.

Эта схема описывает только текущий интерфейс и его бэкенд.
