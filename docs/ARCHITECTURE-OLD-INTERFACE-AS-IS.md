# Архитектура старого интерфейса (tvoiisty) — как есть

Описание **текущего** состояния репозитория tvoiisty: фронт (App.tsx), оба варианта бэкенда (Express и Vercel API), все сервисы, хранилища и внешние вызовы. Старый интерфейс работал правильно — этот документ фиксирует, что именно есть сейчас.

---

## 1. Что такое «старый интерфейс»

- **Фронт:** один SPA — `App.tsx` (React, Vite). Один и тот же фронт может ходить на Express или на Vercel (зависит от `VITE_API_BASE_URL`).
- **Бэкенд:** в репо **два** варианта реализации API:
  - **Express** (`server.ts` + `backend/`) — основной, с БД, сессиями примерки, хранилищем.
  - **Vercel serverless** (`api/*.ts`) — альтернативный деплой (например на Vercel); часть эндпоинтов дублирована, часть есть только здесь.

Ниже — кто за что отвечает и когда что вызывается.

---

## 2. Фронт (App.tsx) — какие сервисы и куда ходит

| Действие | Сервис (файл) | Эндпоинт | Бэкенд |
|----------|----------------|----------|--------|
| Примерка (основной поток) | `tryonService`: createTryon, getTryonStatus | POST /api/tryon, GET /api/tryon/:id | **Только Express** (в server.ts этих роутов нет в api/) |
| Загрузка фото человека / одежды | `mediaService`: uploadPersonPhoto, uploadClothingImage | POST /api/media/upload | **Только Express** |
| Генерация видео по картинке | `geminiService`: generateVideo | POST /api/generate-video | Express или Vercel (зависит от API_BASE) |
| Промпт для примерки (если используется) | `geminiService`: prepareTryonPrompt | POST /api/prepare-tryon-prompt | **Только Vercel** (в Express этого роута нет) |
| Примерка через base64 (Lab/альт. поток) | `geminiService`: generateTryOn | POST /api/generate-image | Express или Vercel |

**Важно:** рабочий канон примерки в старом интерфейсе — это **Express**:  
createTryon (person_asset_id + look_id или clothing_image_url) → polling GET /api/tryon/:id. Эндпоинты `api/generate-image` и `api/prepare-tryon-prompt` из папки `api/` относятся к Vercel-деплою и к альтернативному сценарию (base64, без сессий в БД).

---

## 3. Express-бэкенд (server.ts + backend/)

Используется, когда `VITE_API_BASE_URL` указывает на этот сервер. Все ключи и БД — только на бэкенде.

### 3.1. Роуты

| Метод и путь | Обработчик | Назначение |
|--------------|------------|------------|
| GET /health | healthHandler | Проверка живости |
| GET /health/tryon | — | DB, storage, провайдеры (для мониторинга) |
| POST /api/auth/signup, /api/auth/login, GET /api/auth/me | auth | Регистрация, логин, текущий пользователь |
| GET/PUT /api/user/settings | userSettings | Настройки пользователя |
| GET /api/admin/settings/global, PUT .../:key | adminSettings | Глобальные настройки (модели, лимиты) |
| GET /api/looks, POST/DELETE /api/looks/:id/like | looks | Каталог образов, лайки |
| GET /api/media/upload/check | — | Проверка доступности storage (503 если нет Blob/Supabase) |
| POST /api/media/upload | uploadMediaHandler | Загрузка файла → storage + media_assets + очередь LLM |
| POST /api/tryon | createTryonHandler | Создание сессии примерки (async обработка) |
| GET /api/tryon/:id | getTryonStatusHandler | Статус и image_url (из asset или result_meta) |
| GET /api/my/tryons | listMyTryonsHandler | Список примерок пользователя |
| POST /api/generate-image | generateImageHandler | Примерка через KIE (base64 → createTask + polling), без сессий |
| POST /api/generate-video | generateVideoHandler | Видео по imageUrl через KIE Veo |

В Express **нет** маршрута `/api/prepare-tryon-prompt` — он есть только в Vercel `api/prepare-tryon-prompt.ts`.

### 3.2. Очередь задач (Express)

Есть **одна очередь** — только для анализа загруженных фото (модерация, описание, метаданные). Код: `backend/aiPhotoPipeline.ts`.

- **Тип:** in-memory очередь (массив задач в процессе). Redis/Bull/отдельный Worker не используются.
- **Постановка:** после успешной загрузки в POST /api/media/upload вызывается `enqueuePhotoAnalysis({ assetId, type, analysisType: 'photo_llm_v1' })`. Ответ клиенту отдаётся сразу; обработка идёт в фоне.
- **Обработка:** один цикл `processQueue()` обрабатывает задачи подряд: проверка кеша в `ai_analyses`, при отсутствии успешного результата — вызов OpenRouter (Gemini и др.), запись в `ai_analyses`.
- **Персистентность:** при перезапуске сервера необработанные задачи теряются. Повторная загрузка того же файла (тот же hash) даёт тот же asset — при необходимости анализ можно запустить снова.
- **Примерка и видео** в эту очередь не попадают: примерка выполняется в том же процессе (async после createTryon), видео — синхронно в рамках POST /api/generate-video.

В документе 03-Architecture.md описан вариант с отдельным Worker и очередью заданий (RECEIVED → VALIDATING → … → COMPLETED); в текущей реализации так не сделано — только очередь анализа фото в памяти.

### 3.3. Хранилище (backend/storage.ts)

- **Типы:** person, clothing, location, tryon_result_image, tryon_result_video.
- **Логика:** при наличии `SUPABASE_URL` и `SUPABASE_SERVICE_KEY` — Supabase Storage (при ошибке — fallback на Vercel Blob); иначе — только Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
- **Функции:** `uploadBuffer()`, `mirrorFromUrl()` (для результата Fal/KIE при примерке).

### 3.4. База данных (PostgreSQL, backend/db.js)

- **Таблицы:** users, media_assets, ai_analyses, looks, user_liked_looks, tryon_sessions, token_transactions, app_settings, ai_generation_logs.
- **Модули:** media.ts (assets, findOrCreate по hash), tryonSessions.ts (сессии примерки), looks.ts, tokens.ts, settings.ts, aiPhotoPipeline.ts (очередь анализа), aiLogs.js.

### 3.5. Внешние сервисы (Express)

| Сервис | Где используется | Переменные |
|--------|-------------------|------------|
| **Fal** | Только примерка: tryonEngine → falTryonProvider → falClient.tryOnWithFal | FAL_KEY |
| **KIE** | Примерка (fallback), POST /api/generate-image, POST /api/generate-video | KIE_API_KEY, KIE_BASE_URL |
| **OpenRouter** | Анализ загруженных фото (модерация, описание) после upload | OPENROUTER_API_KEY |
| **Supabase Storage** | Хранение медиа (если настроен) | SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET |
| **Vercel Blob** | Хранение медиа (основное или fallback) | BLOB_READ_WRITE_TOKEN |

Правила: примерка — только через POST /api/tryon (Fal → retry при network → KIE fallback). Подмена virtual-try-on → nano-banana только в этом пайплайне. Видео и «просто картинка» (generate-image) — только KIE.

---

## 4. Vercel API (api/*.ts) — serverless

Используются при деплое на Vercel и когда фронт дергает тот же origin или URL, где замаунчены эти handlers. БД и tryon-сессий здесь нет — только вызовы провайдеров и при необходимости Blob.

### 4.1. Эндпоинты

| Файл | Путь (по соглашению Vercel) | Назначение |
|------|-----------------------------|------------|
| api/generate-image.ts | POST /api/generate-image | Примерка по base64: по model выбирается Fal или KIE, fallback друг на друга (не таймаут). Загрузка base64 в Blob → URL, результат при успехе зеркалится в Blob. |
| api/generate-video.ts | POST /api/generate-video | Видео по imageUrl: KIE (Veo / Runway / jobs/createTask + polling). Результат зеркалится в Blob. |
| api/prepare-tryon-prompt.ts | POST /api/prepare-tryon-prompt | Промпт для примерки: Fal chat (Mixtral) или Fal через OpenAI-прокси; при сбое — единый DEFAULT_IMAGE_PROMPT. Только Fal, OpenAI не вызывается. |

### 4.2. Провайдеры и роутер (api/_lib/)

- **provider-abstraction.ts** — типы и `getImageProvider(model)` (fal-ai/* → Fal, иначе KIE).
- **generate-image-router.ts** — `generateImage(payload)`: по model Fal или KIE; при ошибке (не таймаут) fallback на другой провайдер; virtual-try-on подменяется на nano-banana.
- **providers/fal-image.ts**, **providers/kie-image.ts** — вызовы Fal и KIE для картинки.

### 4.3. Хранилище и внешние вызовы (Vercel)

- **Blob:** загрузка base64 в Blob (ensureHttpsUrl), зеркалирование результата картинки и видео (mirrorResultToBlob, mirrorVideoToBlob). Нужен `BLOB_READ_WRITE_TOKEN`.
- **Fal:** примерка (fal-image), промпт (prepare-tryon-prompt: queue.fal.run Mixtral, опционально FAL_OPENAI_PROXY_URL + FAL_PROXY_API_KEY).
- **KIE:** примерка (kie-image), видео (generate-video: veo/generate, runway/generate, jobs/createTask + polling).
- **Опционально:** ADMIN_WEBHOOK_URL в prepare-tryon-prompt для алертов.

В Vercel API нет PostgreSQL, нет tryon_sessions, нет uploadMedia — только generate-image, generate-video, prepare-tryon-prompt.

---

## 5. Сводка: кто что делает в старом интерфейсе

### 5.1. Примерка (рабочий канон — Express)

1. Пользователь выбирает фото (person_asset_id) и образ (look_id или clothing_image_url).
2. Фронт: `createTryon(...)` → POST /api/tryon (Express).
3. Express: создаётся запись в tryon_sessions, в фоне tryonEngine (Fal → при network retry → KIE fallback), результат — mirror в storage + media_assets или только result_meta.image_url.
4. Фронт: polling GET /api/tryon/:id через `getTryonStatus()` до completed/failed; показывает image_url из ответа.
5. Загрузка фото/одежды до этого: POST /api/media/upload (Express) → storage + media_assets + enqueuePhotoAnalysis (OpenRouter).

### 5.2. Видео

- Фронт: `generateVideo(resultImageUrl)` → POST /api/generate-video.
- Если API_BASE = Express: backend/routes/generateVideo.ts (KIE Veo, один createTask + polling), лог в ai_generation_logs.
- Если API_BASE = Vercel: api/generate-video.ts (KIE Veo/Runway/jobs, mirror в Blob), без БД.

### 5.3. Альтернативный поток примерки (base64, без сессий)

- Если вызывается `generateTryOn(personBase64, clothingBase64)` и/или `prepareTryonPrompt(...)`:
  - prepare-tryon-prompt есть только в Vercel api.
  - generate-image: либо Express (KIE только), либо Vercel (Fal/KIE + fallback, base64 → Blob).
- В основном сценарии старого интерфейса этот поток не используется — используется createTryon + getTryonStatus.

---

## 6. Внешние сервисы — полная таблица (старый интерфейс)

| Сервис | Назначение | Где вызывается | Переменные |
|--------|------------|----------------|------------|
| **PostgreSQL** | Пользователи, медиа, образы, сессии примерки, токены, настройки, логи | Express (backend/) | DATABASE_URL (или из .env) |
| **Supabase Storage** | Хранение медиа (person, clothing, tryon_result_*) | Express storage.ts | SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET |
| **Vercel Blob** | Хранение медиа (Express fallback); в Vercel api — загрузка base64 и mirror результата/видео | Express storage.ts; api/generate-image.ts, api/generate-video.ts | BLOB_READ_WRITE_TOKEN |
| **Fal** | Примерка (primary), подмена virtual-try-on → nano-banana; в api — примерка и prepare-tryon (Mixtral) | Express: falClient, tryonEngine; api: fal-image, prepare-tryon-prompt | FAL_KEY; опционально FAL_OPENAI_PROXY_URL, FAL_PROXY_API_KEY |
| **KIE** | Примерка (fallback), generate-image (Express и api), generate-video (Veo/Runway/jobs) | Express: kieClient, tryonEngine, generateImage, generateVideo; api: kie-image, generate-video | KIE_API_KEY, KIE_BASE_URL |
| **OpenRouter** | LLM-анализ загруженных фото (модерация, описание) | Express aiPhotoPipeline (после upload) | OPENROUTER_API_KEY |
| **ADMIN_WEBHOOK_URL** | Алерты при сбоях prepare-tryon-prompt | api/prepare-tryon-prompt.ts | опционально |

---

## 7. Правила обращения (старый интерфейс)

1. **Примерка с сессиями и БД** — только через Express: POST /api/tryon, GET /api/tryon/:id. Не смешивать с вызовом только POST /api/generate-image без сессий.
2. **Загрузка медиа** — только через Express: POST /api/media/upload. В Vercel api такого эндпоинта нет.
3. **Промпт для примерки** — только в Vercel: POST /api/prepare-tryon-prompt. В Express этого маршрута нет.
4. **Видео** — один и тот же путь POST /api/generate-video может обслуживаться Express или Vercel в зависимости от того, куда смотрит API_BASE.
5. **Ключи** — на фронт не передаются; все вызовы Fal/KIE/OpenRouter и доступ к БД — только на бэкенде (Express или Vercel serverless).

Так устроен старый интерфейс в репозитории tvoiisty на момент описания.
