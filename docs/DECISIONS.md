# Важные решения и справочник по проекту

Документ для быстрого обращения: какие эндпоинты и форматы считаются правильными, как устроены ключевые функции, что важно для релизов.

**При изменении эндпоинтов, форматов запросов, переменных окружения или ключевой логики — обновлять этот файл.**

---

## Workflow

- **Ветка для разработки:** `dev`.
- **Мержить в main** через **Pull Request** из `dev`, без прямых пушей в `main`.
- Пуши — в `dev`; релиз — через PR `dev` → `main`.
- Фиксы и фичи делаются в отдельной ветке (например `fix/...` или `feature/...`), затем **Pull Request в `dev`**. После ревью/мержа в `dev` при необходимости — PR `dev` → `main` для релиза.

---

## KIE AI: интеграция

### Базовый URL

Все запросы к KIE идут на **`https://api.kie.ai/api/v1`** (обязательно префикс **`/api/v1/`**, не `/v1/`).

### Картинка (примерка, try-on)

| Что | Значение |
|-----|----------|
| **Эндпоинт** | `POST https://api.kie.ai/api/v1/jobs/createTask` |
| **Проверено** | Живой endpoint, отвечает 200 (с неверным ключом — 401). Путь `/api/v1/image/edit` даёт 404 — не использовать. |
| **Модель** | `flux-2/flex-image-to-image` (можно переопределить через `KIE_IMAGE_MODEL`) |
| **Тело запроса** | `model` (string), `input` (строка — JSON внутри JSON) |
| **Формат `input`** | Строка, содержащая JSON: `aspect_ratio`, `prompt`, `resolution`, `input_urls` (массив из двух URL) |

Пример успешного запроса к KIE (по твоему примеру):

- `input` — строка с полями: `aspect_ratio: "1:1"`, `prompt: "Virtual try-on: dress the person in the outfit from the second image naturally."`, `resolution: "1K"`, `input_urls: [url1, url2]`.
- В `input_urls` в рабочем примере — **обычные https-URL** (например `https://tempfile.redpandaai.co/...`).

**Важно:** KIE возвращает ошибку `input_urls file type not supported`, если в `input_urls` передать data-URL или base64. Нужны именно **https-URL картинок**. В коде это решено так: если фронт присылает data/base64, `api/generate-image` перед вызовом KIE загружает оба изображения в **Vercel Blob** и подставляет полученные https-URL в `input_urls`. Если пришли уже https-URL — используем как есть.

**Опрос результата:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...`. В ответе: `data.state` (success/fail), при success — `data.resultJson` (строка JSON с `resultUrls`).

### Видео (Veo)

| Что | Значение |
|-----|----------|
| **Создание задачи** | `POST https://api.kie.ai/api/v1/veo/generate` |
| **Опрос результата** | `GET https://api.kie.ai/api/v1/veo/record-info?taskId=...` |
| **Модель** | `veo3` |
| **Формат** | 9:16, `imageUrls: [url]`, промпт (киношный, по умолчанию из кода) |
| **Ответ** | `successFlag` (0 — в работе, 1 — успех, 2/3 — ошибка); URL видео извлекается из нескольких возможных полей (output.video.url, result.video_url, result.videos[0].url, response.result_urls и т.д.) |

---

## Наше приложение (Vercel)

### API-маршруты (serverless)

- **Примерка:** `POST /api/generate-image`  
  Тело: `personImageBase64`, `clothingImageBase64`, `prompt?` (фронт может слать data-URL или base64). Перед KIE: при необходимости загрузка в Vercel Blob → https-URL; затем KIE `jobs/createTask` + polling `jobs/recordInfo`, возвращает `{ imageUrl }`.

- **Видео:** `POST /api/generate-video`  
  Тело: `imageUrl`, `prompt?`. Вызывает KIE `veo/generate` + polling `veo/record-info`, возвращает `{ videoUrl }`.

### Роутинг (vercel.json)

- Rewrite: все пути **кроме** `/api/*` ведут на `/index.html` (SPA).
- Важно: именно `"/((?!api/).*)"` → `/index.html`, чтобы запросы к `/api/...` не отдавали SPA.

### Переменные окружения (Vercel)

- **KIE_API_KEY** — обязателен для примерки и видео.
- **KIE_IMAGE_MODEL** — опционально, по умолчанию `flux-2/flex-image-to-image`.
- **BLOB_READ_WRITE_TOKEN** — для примерки: загрузка картинок в Vercel Blob, чтобы отдавать KIE https-URL. Создаётся в Vercel при добавлении Blob Store в проект (Storage → Blob → Create).

Ключи используются только в serverless-функциях (`api/*`), на фронт не передаются.

### Фронт

- Вызовы только на свои API: `POST /api/generate-image`, `POST /api/generate-video` (см. `services/geminiService.ts`).
- Экспорты из `geminiService`: один блок в конце файла — `export { describeOutfit, generateTryOn, generateVideo };` (чтобы сборка на Vercel не теряла экспорты).

---

## Ошибки и сообщения пользователю

- Клиенту показываем **общие** формулировки (без упоминания KIE, ключей, эндпоинтов): например «Сервис временно недоступен», «Не удалось сгенерировать изображение. Попробуйте позже».
- В логах (Vercel) пишем детали с префиксами `[generate-image]` и `[generate-video]`, чтобы по логам можно было понять причину (ключ, код ответа KIE, отсутствие taskId и т.д.).

---

## Локальная разработка

- Фронт: `npm run dev` (Vite), прокси `/api` → `http://localhost:4000`.
- Бэкенд: `npm run server` (Express на порту 4000), те же маршруты `/api/generate-image`, `/api/generate-video`; KIE вызывается из `backend/kieClient.ts` (те же эндпоинты KIE и формат запросов).

---

*Документ обновляется по мере фиксации решений. При сомнениях по эндпоинтам или формату — сверяться с этим файлом и при необходимости дополнять его.*
