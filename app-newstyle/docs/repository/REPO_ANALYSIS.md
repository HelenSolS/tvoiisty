# REPO_ANALYSIS — Repository Analysis

**Issue 0.** Репозиторий: https://github.com/HelenSolS/newstyle  
**Дата анализа:** 2026-03-08

---

## 1. Структура проекта

### Общая характеристика

- **Монорепо:** один Vite + React (TypeScript) проект.
- **Backend в репозитории отсутствует.** Вся логика генерации (try-on, video) сейчас в frontend через прямые вызовы Gemini / custom service.
- **Точка входа:** `index.tsx` → `App.tsx`.
- **Сборка:** `vite build`, dev: `vite` (port 3000).

### Карта: Frontend / Legacy / AI / Utilities

| Категория | Расположение | Описание |
|-----------|--------------|----------|
| **Frontend (canonical)** | `App.tsx`, `components/` (Step1–Step4, LookScroller, Header, FullscreenPreview, Dropzone, AuthModal, AdminPanel), `types.ts`, `constants.tsx` (без секретов), `translations.ts` | Утверждённый UI. Не переписывать, не менять структуру экранов. |
| **Legacy backend / движок** | Нет отдельной папки backend. Legacy — это вызовы AI из frontend: `services/geminiService.ts`, `services/customService.ts`, хранение в `localStorage`, base64-поток. | Не использовать как основу нового backend. |
| **AI integration (legacy)** | `services/geminiService.ts` (try-on, video, caption), `services/customService.ts`, `services/audioService.ts`. Вызовы из `App.tsx`, `MagicPanel.tsx`, `ContentStudio.tsx`. | Заменить на вызовы нового backend API; не копировать в новый backend без обоснования. |
| **Utility / shared** | `Dropzone.tsx` (загрузка файла → base64), `FullscreenPreview.tsx` (раскрытие карточки). | Переиспользовать только логику UI; передачу медиа перевести на URL после появления backend. |

### Структура каталогов

```
newstyle/
├── index.tsx              # Entry
├── App.tsx                # Main flow, state, step routing
├── types.ts               # Types, enums, AuthState, LookHistoryItem
├── constants.tsx          # Limits, presets, MOCK_SHOPS, CUSTOM_SERVICE_* (секреты!)
├── translations.ts        # RU (и др.) переводы
├── vite.config.ts         # Vite + process.env.API_KEY / GEMINI_API_KEY
├── package.json           # react, @google/genai, vite, typescript
├── components/
│   ├── Header.tsx
│   ├── Step1UploadUser.tsx   # Мои фото
│   ├── Step2UploadClothing.tsx # Образы / одежда
│   ├── Step3Result.tsx       # Результат примерки
│   ├── Step4Video.tsx        # Видео
│   ├── LookScroller.tsx      # История примерок
│   ├── FullscreenPreview.tsx
│   ├── Dropzone.tsx
│   ├── AuthModal.tsx
│   ├── AdminPanel.tsx
│   ├── Gallery.tsx           # Не используется в основном потоке
│   ├── History.tsx           # Не используется в основном потоке
│   ├── ContentStudio.tsx     # generatePostCaption — не в основном потоке
│   ├── MagicPanel.tsx       # generateMagicVideo — не в основном потоке
│   ├── ShopPanel.tsx
│   ├── PaymentModal.tsx
│   └── VoiceAssistant.tsx   # audioService
├── services/
│   ├── geminiService.ts    # generateTryOnImage, generateMagicVideo, generatePostCaption
│   ├── customService.ts    # generateCustomImage (URL + KEY в коде)
│   └── audioService.ts     # Gemini Live
└── migrated_prompt_history/
```

---

## 2. Определение канонического frontend

- **Экран «Мои фото»:** `Step1UploadUser.tsx` — галерея `userPhotos`, загрузка через `Dropzone`, удаление, выбор фото для примерки. Лимит в коде: 20 (slice(0,19)); по архитектуре MVP — 10.
- **Экран «Образы»:** `Step2UploadClothing.tsx` — галерея образов/одежды (mock shops + «Мои загрузки»), grid/scroll, выбор образа для примерки, превью, удаление своих загрузок.
- **Экран «История примерок»:** `LookScroller.tsx` — список `lookHistory`, лайки, удаление из истории, скачать, открыть видео, grid/list, fullscreen по клику.

Дополнительно к экранам: Hero (step 0), Step3Result (результат + кнопки «Создать видео», «Скачать», «Назад»), Step4Video (просмотр видео). Общая механика: grid/список → клик по карточке → fullscreen (`FullscreenPreview`) — не заменять отдельными страницами или модалками.

---

## 3. Определение legacy backend

Отдельного backend-сервера в репозитории нет. Под «legacy backend» понимается:

- **Логика генерации во frontend:** `geminiService.ts` (Gemini API для try-on и video), `customService.ts` (внешний сервис по URL с ключом в коде).
- **Хранение данных:** только `localStorage` (ключ `your_ai_style_2026`): `userPhotos`, `garmentMemory`, `lookHistory`, `likedLooks`, тема, провайдер и т.д.
- **Передача изображений:** base64 end-to-end (FileReader → base64 → Gemini / custom). Нет загрузки файлов на сервер, нет storage layer.
- **API-ключ:** через `process.env.API_KEY` / `GEMINI_API_KEY` (vite.config) и/или `window.aistudio?.hasSelectedApiKey` / `openSelectKey`.

Этот код не использовать как основу новой архитектуры. Новый backend — с нуля (очереди, storage, Fal/KIE), frontend только вызывает API.

---

## 4. Зависимости

- **Используются в основном потоке:** react, react-dom, @google/genai (Gemini try-on и video), vite, typescript.
- **К удалению/замене при интеграции:** прямые вызовы `@google/genai` из frontend — заменить на вызовы нашего API. `customService` и константы с URL/KEY — убрать из frontend; при необходимости вызовы перенести только на backend.
- **Оставить во frontend:** react, react-dom, vite, typescript; всё, что нужно только для UI и для вызовов нового backend (fetch/axios к нашему API).

---

## 5. Интеграции AI (legacy)

- **Где вызывается AI:**  
  - `App.tsx`: `generateTryOnImage(userPhoto, garment)`, `generateMagicVideo(resultImage, prompt)`.  
  - `MagicPanel.tsx`: `generateMagicVideo`.  
  - `ContentStudio.tsx`: `generatePostCaption`.
- **Как передаются изображения:** base64 (data URL или raw base64) в аргументах и в теле запросов к Gemini.
- **Устаревшее:** прямой вызов Gemini/custom из браузера, хранение ключей в env frontend, отсутствие очередей, retry и fallback на backend.

---

## 6. Обработка медиа (текущая)

- **Загрузка:** `Dropzone` → `FileReader.readAsDataURL` → base64 → callback. Никакой проверки размера, сжатия или upload на сервер.
- **base64:** да, используется повсеместно для userPhotos, garmentMemory, lookHistory (в state и localStorage).
- **Сжатие:** нет.
- **Upload на сервер:** нет. После интеграции: frontend отправляет файл на `POST /api/media/upload`, получает `{ id, url }`, дальше работает с URL.

---

## 7. Безопасность

- **Секреты в коде:** `constants.tsx`: `CUSTOM_SERVICE_URL`, `CUSTOM_SERVICE_KEY` — в репозитории. Критично удалить перед любым публичным доступом и вынести в env на backend.
- **API keys:** Gemini через `process.env.API_KEY` / `GEMINI_API_KEY` в Vite — не коммитить `.env` с реальными ключами; в продакшене ключи только на backend.
- **Логирование изображений:** в просмотренном коде полные base64/изображения в логи не выводятся (только ошибки). При интеграции: в логах только метаданные, без тел с медиа и без подписанных URL с секретами.

---

## 8. Предложенный план интеграции

1. **Не трогать:** структуру экранов, переходы grid → expanded, визуал. Только заменить источник данных и вызовы генерации на новый backend.
2. **Добавить слой API во frontend:** один модуль (например `api/client.ts`) с методами под контракт из `API_REQUIREMENTS.md`: upload, my photos, looks, tryon, history, video. Все медиа по итогу — по URL из этого API.
3. **Убрать из frontend:** прямые вызовы `geminiService` / `customService` для try-on и video; использование `process.env.API_KEY` / `window.aistudio` для генерации; хранение в state/localStorage массивов base64 для «моих фото» и истории — заменить на списки `{ id, url }` с бэкенда.
4. **Адаптация экранов без смены структуры:**  
   - Step1: загрузка через `POST /api/media/upload`, список через `GET /api/my/photos`, удаление `DELETE /api/my/photos/:id`; лимит 10 и TTL — на backend.  
   - Step2: образы через `GET /api/looks`, лайк `POST /api/looks/:id/like`; при «примерить» — `POST /api/tryon` с `photoId` и `lookId`.  
   - Step3/Step4: статус через `GET /api/tryon/:id`, видео через `POST /api/tryon/:id/video`; отображать `pending` / `processing` / `completed` / `failed`.  
   - LookScroller: данные из `GET /api/history`; скачать/поделиться/видео — по URL из ответа.
5. **Идемпотентность и UX:** защита от двойного тапа на «Примерить» (disable + возможно idempotency key с backend); сообщения об ошибках — на русском, нейтральные; детали — только в логах backend.
6. **Cleanup и миграции:** не удалять старый код фронта (Gemini/custom, localStorage) до проверки нового потока end-to-end; затем по согласованию удалить legacy-вызовы и перейти только на новый API.

---

## 9. Уточнения (после ревью)

- **Лимит фотографий:** User photo limit is **10**. Frontend may currently allow more (e.g. 20 in code); **backend must enforce 10**.
- **Источник образов:** Looks are **managed by admins**. Users only read and like them; образы попадают в общую галерею через админку.
- **Видео:** Only the **latest video per try-on session** must be stored. Предыдущие видео по той же сессии не сохраняем.

---

## 10. Итог

- **Канонический frontend:** описан в `FRONTEND_MAP.md` — его не переписывать.
- **Legacy:** описан в `LEGACY_MAP.md` — не использовать как основу backend.
- **API для нового backend:** перечень в `API_REQUIREMENTS.md`.
- **План интеграции:** выше; разработка нового backend начинается только после согласования этого анализа и плана.
