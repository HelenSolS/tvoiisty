# Каноны: старый интерфейс и перенос в новый

Каноны **должны стабильно работать на старом интерфейсе** (tvoiisty: App.tsx, backend в этом репо).  
**Перенос в новый интерфейс** (tvoiistyle) — только когда скажете, что готовы к переносу; тогда повторяем эти правила там.

---

## Где каноны починены (старый интерфейс, tvoiisty)

### 1. Примерка: модель только nano-banana (не virtual-try-on)

| Место | Файл | Что сделано |
|-------|------|-------------|
| Backend tryon | `backend/routes/tryon.ts` | Если в настройках/запросе пришла модель с `virtual-try-on` → подставляется `fal-ai/nano-banana-pro/edit`. |
| Backend Fal | `backend/falClient.ts` | При вызове Fal: если параметр модели содержит `virtual-try-on` → используется `fal-ai/nano-banana-pro/edit`. |
| Fallback (api/lib) | `api/_lib/generate-image-router.ts`, `lib/generate-image-router.ts` | Fallback-модель заменена на `fal-ai/nano-banana-pro/edit` (не virtual-try-on). |

Дефолты: `backend/settings.ts` (DEFAULT_IMAGE_MODEL), `docs/CANON-PROVIDERS-AND-MODELS.md`.

---

### 2. Примерка: порядок провайдеров Fal → KIE, fallback при ошибке

| Место | Файл | Что сделано |
|-------|------|-------------|
| Движок | `backend/services/tryonEngine.ts` | Primary = Fal, при сбое (не таймаут) → KIE. |
| Роутер | `backend/services/providerRouter.ts` | Primary из настроек (fal), fallback при наличии ключа (KIE). |
| Политика | `backend/services/tryonTypes.ts` | Таймаут Fal → fallback не вызывается; rate_limit/auth/provider_error → fallback разрешён. |
| Fal 402/429 | `backend/falClient.ts`, `backend/providers/falTryonProvider.ts` | Квота/токены → rate_limit → срабатывает fallback на KIE. |

Тесты: `tests/tryon-fallback.test.ts`, запуск: `npm run test:canon`.

---

### 3. Таймаут Fal: 70 с (чтобы ответ ~63 с успевал)

| Место | Файл | Что сделано |
|-------|------|-------------|
| Backend Fal | `backend/falClient.ts` | `FAL_POLL_TIMEOUT_MS = 70_000`. |

---

### 4. Образы магазина: загрузка до примерки (не «просят id»)

| Место | Файл | Что сделано |
|-------|------|-------------|
| Новый товар | `App.tsx` | При «Опубликовать» сначала `uploadClothingImage(image)` → в карточку сохраняется **url** с сервера. |
| Коллекция | `App.tsx` | При «Опубликовать коллекцию» каждый образ загружается через `uploadClothingImage` → в товары пишутся **url**. |

В витрине у новых товаров/коллекций `imageUrl` — всегда https-URL; примерка идёт по `clothing_image_url`, без требования `look_id` для этих карточек.

---

### 5. Блокировка повторных нажатий «Примерить»

| Место | Файл | Что сделано |
|-------|------|-------------|
| Синхронная блокировка | `App.tsx` | `tryOnInProgressRef`: пока примерка идёт, повторные клики не отправляют запрос. Кнопка `disabled={state.isProcessing}`. |

---

### 6. Ошибки примерки: клиенту — нейтрально, админу — полный лог и алерт

| Место | Файл | Что сделано |
|-------|------|-------------|
| Сообщение клиенту | `backend/services/tryonTypes.ts` | Константа `TRYON_USER_FACING_ERROR`: «Не удалось выполнить примерку. Попробуйте позже.» — без KIE/Fal, taskId, ключей, квот. |
| Роут | `backend/routes/tryon.ts` | При ошибке в БД и в ответе GET /api/tryon/:id пишется только нейтральный текст. В лог: `[tryon] ALERT failed` с `provider: "primary fal"` или `"fallback KIE"` и `internalError` (полный текст от провайдера). При исключении — `[tryon] ALERT exception` + нейтральное сообщение клиенту. |
| Движок | `backend/services/tryonEngine.ts` | В `TryOnResult` при ошибке добавлены `failedProvider` и `wasFallback`, чтобы в логах было понятно: первичный Fal или резервный KIE. |
| KIE-клиент | `backend/kieClient.ts` | При non-OK или отсутствии taskId в лог пишется **полный ответ KIE** (`JSON.stringify(data)`); клиенту не передаётся — throw нейтрального сообщения «Сервис примерки временно недоступен.» |

Клиент никогда не видит: KIE API key, квоты, taskId, полный ответ KIE. Админ смотрит логи backend по `[tryon] ALERT` и `[KIE]`.

---

## Чеклист для переноса в новый интерфейс (tvoiistyle)

Когда будете готовы к переносу — в новом фронте (другой репо) нужно обеспечить то же поведение. Backend (API) уже каноничный; новый UI должен только правильно вызывать API.

- [ ] **Примерка:** вызов только `POST /api/tryon` (backend сам использует nano-banana и Fal→KIE). Не вызывать старый `POST /api/generate-image` с моделью virtual-try-on.
- [ ] **Одежда для примерки:** для своих образов (не из каталога looks) — сначала `POST /api/media/upload` (type=clothing), в примерку передавать полученный **url** в `clothing_image_url`. Не отправлять длинные data URL и не требовать look_id для таких карточек.
- [ ] **Кнопка «Примерить»:** пока идёт запрос (pending/processing) — кнопка disabled или блокировка повторного клика, без повторной отправки запроса.
- [ ] **Ошибки:** при таймауте/ошибке Fal пользователь видит сообщение; fallback на KIE выполняется на бэкенде без смены экрана (получаете результат по GET /api/tryon/:id).

Контракт API: `docs/api-contract-tryon.md`. Базовый канон моделей: `docs/CANON-PROVIDERS-AND-MODELS.md`.
