# QA Next Stage: Test Cases and Results

Связка с заданием: [QA-TASK-NEXT-STAGE.md](./QA-TASK-NEXT-STAGE.md).

---

## 1) Обновлённые и устаревшие тесты

### Устаревшие ожидания (удалить или переформулировать)

| Где | Что устарело | Действие |
|-----|----------------|----------|
| Любые тесты, предполагающие «история только по auth» | История теперь по `owner` (auth или `X-Client-Id` / `X-User-Id`). | Переформулировать: проверять owner-based history, при необходимости передавать заголовки. |
| Статичные кнопки «быстрого флоу» в UI | В новом UI карточки с overlay/действиями в grid и list. | Пометить устаревшими или удалить проверки старых кнопок. |
| Тесты tryon без owner | `createTryonHandler` и история требуют `owner` (middleware или заголовки). | Добавить `resolveOwnerMiddleware` и заголовок `X-Client-Id` в запросы. |

### Обновлённые тест-кейсы (ID и что изменено)

| Test ID (legacy) | Файл | Что изменено |
|------------------|------|--------------|
| tryon-pipeline | `tests/integration/tryon-pipeline.test.ts` | В тестовый app добавлен `resolveOwnerMiddleware`; POST /api/tryon выполняется с заголовком `X-Client-Id: test-client-pipeline`. Ожидания те же: 201, tryon_id, polling до completed, непустой image_url. |
| user-photos (spec) | `tests/integration/user-photos.test.ts` | Пока только todo; после появления эндпоинтов /api/user/photos учесть лимит 10 и owner. |

Остальные сьюты (admin-settings, store-looks, upload-media, aiPhotoPipeline, openrouter, smoke) не проверяют owner/history/limits — изменений не требуют.

---

## 2) Новые тест-кейсы (обязательные)

Формат результата: `Test ID | Scenario | Environment | Result | Evidence`.

### A. Owner and Data Isolation

| ID | Scenario | Environment | Result | Evidence |
|----|----------|-------------|--------|----------|
| A1 | Web guest: первый визит создаёт/стабилизирует client owner id; после reload тот же device видит те же данные. | Web desktop (Chrome), dev | | |
| A2 | Telegram owner: пользователь Mini App после reopen видит свои данные. | Telegram Mini App (iOS/Android), dev | | |
| A3 | Isolation: разные client/owner не видят чужие фото и историю. | Web + два профиля/устройства или два X-Client-Id | | |

### B. Limits and Trimming

| ID | Scenario | Environment | Result | Evidence |
|----|----------|-------------|--------|----------|
| B4 | My Photos limit = 10: загрузить >10 фото, убедиться что остаётся только последние 10. | Web, dev | | |
| B5 | History limit = 50: сгенерировать >50 примерок, убедиться что в списке не более 50. | Web, dev | | |
| B6 | Один video pointer на элемент истории: re-animate перезаписывает существующий videoUrl у того же элемента. | Web, dev | | |

### C. Offline Queue and Reconnect

| ID | Scenario | Environment | Result | Evidence |
|----|----------|-------------|--------|----------|
| C7 | Offline like/delete/re-animate: выполнить действия офлайн, подключиться, проверить успешную синхронизацию. | Web mobile / desktop, dev | | |
| C8 | Queue survives reload: при наличии pending actions перезагрузить приложение, убедиться что sync возобновляется. | Web, dev | | |
| C9 | No data loss on reconnect: итоговое состояние UI совпадает с успешной синхронизацией на сервере. | Web, dev | | |

### D. New/Viewed History Markers

| ID | Scenario | Environment | Result | Evidence |
|----|----------|-------------|--------|----------|
| D10 | New marker: новые элементы истории помечены как new. | Web, dev | | |
| D11 | Viewed: маркер сбрасывается после просмотра. | Web, dev | | |
| D12 | No immediate reorder jump: при сбросе маркера список не «прыгает» в текущей сессии. | Web, dev | | |

### E. UI/UX Regression Pack

| ID | Scenario | Environment | Result | Evidence |
|----|----------|-------------|--------|----------|
| E13 | Issue #77: slider/list, одна карточка не на всю ширину, размеры карточек стабильные, скругления и стиль единообразны. | Web, dev | | |
| E14 | Card action controls: кнопки отображаются и работают в grid и list. | Web, dev | | |
| E15 | Core flow regression: quick flow и main flow оба дают примерку и сохраняют в историю. | Web, dev | | |

### F. API/CORS Smoke

| ID | Scenario | Environment | Result | Evidence |
|----|----------|-------------|--------|----------|
| F16 | GET /health возвращает 200. | dev / prod | | |
| F17 | GET /api/looks (с auth при необходимости) возвращает активные образы. | dev / prod | | |
| F18 | Preflight и запросы с owner-заголовками не блокируются CORS. | Web → API, dev | | |

---

## 3) Отчёт по провалам (шаблон)

Для каждого провала заполнять:

- **Reproduction steps:** пошагово.
- **Expected vs actual:** что ожидалось и что получено.
- **Evidence:** screenshot/video, network/log snippet.
- **Severity:** `blocker` | `major` | `minor`.

---

## 4) Приоритеты

- **P0:** A1–A3, C7–C9, F16–F18, E15 (owner/isolation, offline sync, API/CORS, core try-on).
- **P1:** E13, E14 (UI #77, grid/list).
- **P2:** B4–B6, D10–D12, длительные/нагрузочные сценарии.

---

## 5) Сводка по тестам

- **Обновлённые legacy:** tryon-pipeline (owner), user-photos (spec — после реализации API).
- **Новые ID:** A1–A3, B4–B6, C7–C9, D10–D12, E13–E15, F16–F18.

**Бэкенд-интеграционные тесты (авто):**
- **B6** — `tests/integration/history-video-pointer.test.ts`: для одной history-сессии повторный reanimate порождает один актуальный videoUrl (один pointer), без дубликатов в истории.
- **A3** — `tests/integration/owner-isolation.test.ts`: два владельца (X-Client-Id), GET /api/history возвращает только свои записи.
- **B4** — `tests/integration/my-photos-limit.test.ts`: у владельца >10 фото, GET /api/my/photos возвращает не более 10.
- **B5** — `tests/integration/history-limit.test.ts`: у владельца >50 завершённых примерок, GET /api/history возвращает не более 50.
- **F16** — smoke: `tests/smoke/server-viability.test.ts` — GET /health 200.
- **F17** — smoke: GET /api/looks 200 и массив looks.
- **F18** — smoke: GET /api/history с X-Client-Id возвращает 200 и массив (проверка, что owner-заголовки не режутся CORS).
- **D10/D11** — `tests/integration/history-viewed-marker.test.ts`: сессия без viewed_at → GET /api/history даёт isNew: true; после POST /api/history/viewed с этим id → GET даёт isNew: false.

После прогона заполнять колонки Result и Evidence в таблицах выше.

---

## 6) Вопросы по новым тестам (для уточнения перед добавлением)

Ниже — что нужно уточнить, чтобы корректно **добавить** недостающие авто- или E2E-тесты (не только актуализировать существующие).

### Issue #77 (E13, E14)

- В репо нет описания бага/фичи «#77». Где искать критерии приёмки: GitHub issue, отдельный док, комментарий в коде?
- Нужны ли точные формулировки: «одна карточка не на всю ширину» (макс. ширина в px или %, в каком режиме — grid/list), «стабильные размеры», «скругления единообразны» — чтобы заложить их в E2E или визуальный регрессионный тест?

### Offline queue и reconnect (C7–C9)

- Очередь офлайн-действий реализована во фронте: `pendingHistoryQueue.ts` (localStorage), flush в `App.tsx` при появлении сети/`syncTick`. Для C7–C9 планируются:
  - **E2E (Playwright):** отключить сеть → like/delete/reanimate → включить сеть → проверить синхронизацию и состояние UI?
  - Или пока только ручные сценарии с заполнением Result/Evidence?
- C8 (queue survives reload): проверять перезагрузку страницы при ненулевой очереди и последующий flush — этого достаточно или нужны ещё сценарии (например, несколько вкладок)?

### A1, A2 (Web guest / Telegram owner)

- Ожидается ли **автотест**: например, E2E с двумя профилями/вкладками (разные `X-Client-Id`) и проверкой, что данные не смешиваются? Или A1/A2 остаются ручными с заполнением Evidence?
- Для A2 (Telegram Mini App): есть ли тестовое окружение или инструкция (эмулятор, тестовый бот), на которое можно опереться в E2E?

### B6 (один video pointer на элемент истории)

- Достаточно ли **бэкенд-интеграционного** теста: повторный reanimate для одной и той же сессии перезаписывает `result_video_asset_id` (в ответе и в БД один актуальный videoUrl), или нужна также проверка в UI?

### D10–D12 (new/viewed маркеры)

- На уровне API можно добавить тест: сессия без `viewed_at` → GET /api/history возвращает элемент с `isNew: true`; после POST /api/history/viewed с этим id следующий GET возвращает `isNew: false`. Этого достаточно для D10/D11 в автотестах или нужны ещё проверки в UI (например, D12 «список не прыгает») только вручную/E2E?

### E2E и инфраструктура

- В репо есть только заглушка `tests/e2e/ai-generation.e2e.test.ts` (todo). Планируется ли общая настройка E2E (Playwright, конфиг, поднятие dev-сервера/API) для сценариев E13–E15, C7–C9? Или на текущем этапе приоритет: backend-интеграционные тесты + ручные прогоны с заполнением таблиц в §2?
