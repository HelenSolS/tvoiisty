# CURSOR_MASTER_PROMPT.md

Перед любыми действиями Cursor должен прочитать этот документ и документы в `docs/architecture` и `docs/cursor`.

---

## Критичное (краткий список)

- **Фронт инвестора заморожен** — не переделывать, не реорганизовывать.
- **Legacy backend не основа** — не копировать из него куски без явного обоснования.
- **main / dev / PR** — по GIT_WORKFLOW_RULES: в main не пушить, работа в dev, PR с описанием.
- **Сначала docs, потом plan** — прочитать архитектуру и workflow, затем предложить план; без этого к реализации не приступать.
- **Backend не в Vercel** — очереди, воркеры, storage, AI pipeline только на выделенном backend-сервере.
- **Очереди обязательны** — тяжёлые операции только через queue.
- **Storage / media_assets обязательны** — все медиа через storage layer и записи в media_assets.
- **Без скрытых рефакторингов** — не менять лишние файлы, не «улучшать» по пути.
- **Без больших diff** — маленькие, изолированные изменения.

---

## Язык и логи

- **Интерфейс** — только на русском. Сообщения пользователю — на русском, спокойные, не пугающие.
- **Логи** — подробные для админа и разработки (на усмотрение команды: русский или английский). В логах не должно быть пользовательских фото, base64, секретов (см. правила ниже).

---

## 20 обязательных правил

### 1. Сначала чтение документов, потом любые действия

Cursor должен сначала прочитать все документы проекта и только потом предлагать план.

**Правило:**  
Before any code changes, you must read the architecture and workflow docs in `docs/architecture` and `docs/cursor`. Do not start implementation until you summarize the relevant constraints and propose a plan.

---

### 2. Никаких скрытых изменений сверх задачи

Не чинить одно и заодно «улучшать» ещё 12 файлов.

**Правило:**  
Do not make opportunistic refactors. Do not change unrelated files. Do not fix adjacent code unless explicitly asked or unless it blocks the requested task.

---

### 3. Не трогать утверждённый фронт без явного разрешения

Не только визуально не ломать, но и не реорганизовывать структуру фронта «для красоты».

**Правило:**  
Treat the approved frontend as frozen UI. Do not redesign, restructure, rename, or simplify frontend screens unless explicitly required for integration.

---

### 4. Не использовать legacy backend как основу

Не копировать из него куски без объяснения.

**Правило:**  
Legacy backend code is not a foundation. Do not copy legacy implementation into the new backend unless you explicitly identify a small reusable utility and justify it.

---

### 5. Сначала API contract, потом код backend

Иначе контроллеры пишутся первыми, а контракт подгоняется задним числом.

**Правило:**  
For any new module, define or confirm the API contract first. Implementation starts only after the request/response shape is agreed.

---

### 6. Сначала схема данных, потом бизнес-логика

Иначе потом начинается миграционный ад.

**Правило:**  
Do not implement business logic before confirming the data model and table ownership.

---

### 7. Любая миграция БД — только явной миграцией

Не «ensure table if not exists» как попало, не молчаливые изменения схемы на старте.

**Правило:**  
Database changes must be introduced through explicit migrations. Do not silently alter schema at runtime.

---

### 8. Никаких секретов в коде, логах, коммитах и PR

Не только в .env, но и в выводе, примерах, тестах.

**Правило:**  
Never print or commit secrets. Never include real tokens, passwords, URLs with credentials, or service keys in code, logs, tests, or pull requests.

---

### 9. Логи не должны утекать пользовательскими фото и base64

**Правило:**  
Do not log full image payloads, base64 bodies, signed URLs, or raw provider responses containing sensitive media links. Log metadata only.

---

### 10. Не менять env-переменные и деплой-модель без явного указания

Не «упрощать деплой» самовольно.

**Правило:**  
Do not rename, remove, or repurpose environment variables without explicit approval. Do not change deployment topology on your own.

---

### 11. Не переводить backend в serverless

Критично: Vercel не подходит для нашего backend.

**Правило:**  
Do not move backend logic to Vercel/serverless. Queues, workers, storage orchestration, and AI pipelines must remain on the dedicated backend/server.

---

### 12. Worker и API — разные роли

Их нельзя смешивать в один «толстый» серверный хендлер.

**Правило:**  
Keep API request handling separate from background workers. API creates and tracks jobs; workers execute long-running tasks.

---

### 13. Идемпотентность обязательна

Иначе двойной тап — и две генерации.

**Правило:**  
All create-job endpoints must be designed with idempotency in mind. Repeated clicks or retries must not create uncontrolled duplicate generations.

---

### 14. Не списывать токены до успешного результата

**Правило:**  
Tokens/credits must not be finally charged before a successful completed generation, unless the product rule explicitly says otherwise.

---

### 15. Cleanup не должен трогать не те сущности

Иначе удалятся результаты вместо временных фото.

**Правило:**  
Cleanup jobs must only affect temporary user photos and explicitly expired assets. Looks, completed results, and current videos must never be removed by generic cleanup logic.

---

### 16. Не менять UX-переходы grid → expanded slider

Не «временно упрощать» общую механику галерей.

**Правило:**  
Do not replace the shared expanding gallery behavior with separate pages, modal hacks, or temporary UI shortcuts.

---

### 17. Любой PR должен содержать человеческое описание

Не только код.

**Правило:**  
Every pull request must include: what was changed, why it was changed, which files were affected, risks, how to test.

---

### 18. Никаких массовых переименований и форматирующих штормов

**Правило:**  
Do not perform broad renames, formatting-only sweeps, or folder reshuffles unless explicitly requested.

---

### 19. Если не уверен — спрашивать, а не угадывать

Особенно по архитектуре, хранилищу, очередям, БД, деплою, пользовательским сценариям.

**Правило:**  
If a requirement is ambiguous and affects architecture, storage, queues, database, deployment, or user flows, stop and ask before coding.

---

### 20. Не удалять старое, пока новое не доказало работоспособность

**Правило:**  
Do not delete or replace legacy flows until the new implementation is verified end-to-end.
