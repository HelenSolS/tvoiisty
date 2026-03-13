# LEGACY_MAP — Карта legacy-кода

Этот код **не использовать как основу** нового backend. При интеграции — заменить вызовы на API нового backend; при необходимости брать только отдельные утилиты с явным обоснованием.

---

## 1. Legacy backend (в репозитории — логика во frontend)

Отдельного backend-сервера в репозитории нет. Под «legacy backend» понимается:

| Что | Где | Описание |
|-----|-----|----------|
| Генерация try-on | `App.tsx` → `services/geminiService.ts` | `generateTryOnImage(userPhoto, garment)` — base64 in/out, прямой вызов Gemini. |
| Генерация видео | `App.tsx`, `MagicPanel.tsx` → `services/geminiService.ts` | `generateMagicVideo(imageUri, prompt)` — прямой вызов Gemini Veo. |
| Кастомный сервис | `services/customService.ts` | `generateCustomImage(prompt)` — запрос на внешний URL с ключом из `constants.tsx`. |
| Хранение данных | `App.tsx` + `localStorage` | Ключ `your_ai_style_2026`: userPhotos, garmentMemory, lookHistory, likedLooks, theme, provider. Нет БД, нет storage. |
| API-ключ | `vite.config.ts`, `window.aistudio` | `process.env.API_KEY` / `GEMINI_API_KEY`; в AI Studio — `hasSelectedApiKey`, `openSelectKey`. |

**Не копировать** эту логику в новый backend. Новый backend строится по `docs/architecture` (очереди, Fal/KIE, storage, миграции).

---

## 2. Legacy AI pipelines

| Файл | Функции | Использование |
|------|---------|----------------|
| `services/geminiService.ts` | `generateTryOnImage`, `generateMagicVideo`, `generatePostCaption` | App.tsx (try-on, video), MagicPanel (video), ContentStudio (caption). |
| `services/customService.ts` | `generateCustomImage` | Импорт есть; в основном потоке App не используется. |
| `services/audioService.ts` | Gemini Live (голос) | VoiceAssistant.tsx. Не в основном потоке. |

**Где происходят AI-вызовы:** только из браузера (frontend). Изображения передаются в виде base64 (data URL или raw).  
**Что устарело:** вызовы из клиента, отсутствие очередей, retry и fallback на backend, хранение результата только в памяти/localStorage.

---

## 3. Старые API endpoints

В репозитории **нет** своего backend. Внешние вызовы:

- **Gemini API** — через `@google/genai` (try-on, video, caption).
- **Custom service** — `constants.tsx`: `CUSTOM_SERVICE_URL` (например `http://82.22.36.170:8002/...`), метод POST, заголовок `X-API-Key`.

Новый backend должен реализовать свои endpoints по `API_REQUIREMENTS.md`; старые URL и ключи во frontend убрать.

---

## 4. Старые решения по storage и медиа

| Что | Где | Проблема |
|-----|-----|----------|
| Медиа в памяти | `state.auth.userPhotos`, `garmentMemory`, `lookHistory` | Массивы base64/data URL. Нет загрузки на сервер, нет TTL, нет лимита на backend. |
| Медиа в localStorage | Тот же state сериализуется в `your_ai_style_2026` | Большие объёмы base64, ограничение размера хранилища, нет контроля срока жизни. |
| Загрузка файла | `Dropzone` → `FileReader.readAsDataURL` | Только base64 в браузере. Нет multipart upload, нет сжатия, нет проверки размера на сервере. |

Новый backend: все медиа через storage layer (Supabase), записи в `media_assets`; пользовательские фото — лимит 10, TTL 15 дней; результаты примерки и видео — обязательно сохранять у себя.

---

## 5. Сводная таблица legacy

| Категория | Папки/файлы | Действие |
|-----------|-------------|----------|
| Legacy backend (логика) | `App.tsx` (handleTryOn, handleCreateVideo), `services/geminiService.ts`, `services/customService.ts` | Не использовать как основу. Frontend перевести на вызовы нового API. |
| Legacy pipelines | `services/geminiService.ts`, `services/customService.ts`, `services/audioService.ts` | Не копировать в новый backend без обоснования. |
| Legacy storage | localStorage в App, state с base64 | Заменить на данные с API (id, url). |
| Секреты | `constants.tsx`: CUSTOM_SERVICE_URL, CUSTOM_SERVICE_KEY | Удалить из репозитория; использовать только env на backend. |

---

## 6. Что можно использовать только как reference

- **Формат запроса/ответа Gemini** (модели, поля) — только как справка для backend-провайдеров (Fal/KIE), не копировать вызовы из браузера.
- **Структура состояния UI** (userPhotos, lookHistory, likedLooks) — как подсказка для формата ответов API (списки с id, url, createdAt и т.д.).
- **Поведение экранов** (шаги, кнопки, переходы) — как референс при проверке, что новый API покрывает все сценарии.

Любое копирование кода из legacy в новый backend — только после явного выделения небольшого фрагмента (например, утилиты) и обоснования в плане/ревью.
