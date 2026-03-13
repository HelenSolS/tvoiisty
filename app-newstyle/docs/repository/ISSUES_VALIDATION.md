# Сверка реализованных ишью с твоей спецификацией

Ниже — что сделано в коде vs что в твоих описаниях. Различия помечены и предложены варианты.

---

## ISSUE 2 — DATABASE

### Твоя спецификация (Core MVP)

**Таблицы только:** users, media_assets, looks, look_likes, tryon_sessions.

**Out of scope:** token_transactions, ai_generation_logs, jobs.

**media_assets:**  
id, type, **original_url**, **preview_url**, **storage_key**, **hash**, **mime_type**, **size**, **width**, **height**, **owner_user_id** (nullable), created_at, **expires_at** (nullable), **is_deleted**.

**looks:**  
id, **title**, **main_asset_id**, **status**, created_at, **updated_at**.

**tryon_sessions:**  
id, user_id, **person_asset_id**, look_id, status, **provider** (nullable), **result_image_asset_id**, **result_video_asset_id**, **error_message** (nullable), created_at, **started_at**, **completed_at** (nullable).

**user_photos:** в спецификации Issue 2 нет — «мои фото» могут быть через media_assets (type + owner_user_id).

### Что сделано в коде

- Есть таблицы: **user_photos**, **token_transactions**, **ai_generation_logs** (в спецификации — out of scope).
- **media_assets:** только id, type, url, created_at, owner_id. Нет: original_url, preview_url, storage_key, hash, mime_type, size, width, height, expires_at, is_deleted; owner_id вместо owner_user_id.
- **looks:** image_asset_id вместо main_asset_id; нет title, status, updated_at.
- **tryon_sessions:** photo_id (FK на user_photos) вместо person_asset_id; result_asset_id / video_asset_id вместо result_image_asset_id / result_video_asset_id; нет provider, error_message, started_at, completed_at.

### Вывод и что делать

- Схема в репозитории не совпадает с твоей Core MVP: лишние таблицы, другие названия/набор полей.
- Нужно определиться:
  1. **Вариант A:** Новая миграция (002), которая приводит схему к твоей спецификации: правим media_assets, looks, tryon_sessions; убираем или не создаём token_transactions, ai_generation_logs в рамках MVP; решаем, оставляем ли user_photos или «мои фото» только через media_assets.
  2. **Вариант B:** Откатить 001 и заменить одной миграцией под твою спецификацию (если окружения пустые и откат допустим).

Плюс: добавить автотесты миграций (миграции применяются, таблицы и индексы/FK есть), как в твоём Autotester для Issue 2.

---

## ISSUE 3 — STORAGE

### Твоя спецификация

- Методы: uploadImage(), deleteAsset(), mirrorFromUrl().
- Конфиг только из config, без AI, без provider-specific hacks.
- **Autotester:** upload возвращает **url + storage_key**; mirrorFromUrl работает; deleteAsset удаляет. Тесты в CI.

### Что сделано в коде

- uploadImage(), deleteAsset(), mirrorFromUrl() есть.
- uploadImage возвращает только **string (url)**. **storage_key** не возвращается и не сохраняется.
- Есть pathFromPublicUrl() и removeByPublicUrl() — для удаления по URL из БД (не в спецификации, но не противоречат «весь upload через storage»).
- Автотестов для storage нет.

### Вывод и что делать

- Нужно: uploadImage возвращал не только url, но и **storage_key** (например `{ url, storageKey }`), и при необходимости сохранять storage_key в media_assets (после приведения схемы к твоей).
- Добавить автотесты: upload → url + storage_key; mirrorFromUrl; deleteAsset; подключать в CI/PR.

---

## ISSUE 4 — MEDIA: User photo upload

### Твоя спецификация

- **Только** POST /api/media/upload.
- Ответ: **{ id, url, previewUrl }**.
- Сжатие: **max side 2048px** (normalized), **preview 512px**.
- Обязательное сжатие, только изображения, только через storage + media_assets.
- **Out of scope:** лимит 10, TTL, looks, try-on.
- **Autotester:** успешная загрузка, запись в media_assets, **preview создаётся**, невалидный файл отклоняется. Тесты в CI.

### Что сделано в коде

- POST /api/media/upload есть, плюс GET /api/my/photos и DELETE /api/my/photos/:id (по твоей разбивке это уже Issue 5).
- Ответ: **{ id, url, createdAt }** — нет **previewUrl**.
- Сжатие: **1536px**, без отдельного **preview 512px**.
- Лимит 10 и удаление самого старого реализованы (у тебя — out of scope для Issue 4).
- Используется таблица **user_photos**; в твоей схеме Issue 2 её нет — «мои фото» через media_assets.
- Автотестов нет.

### Вывод и что делать

- Привести к спецификации:
  - Только upload в Issue 4; список/удаление — в Issue 5.
  - Размер: 2048px (normalized) + отдельная превью 512px; в ответе добавить previewUrl.
  - Убрать из этого ишью лимит 10 и «удаление самого старого» (или явно перенести в отдельный scope/ишью).
- Модель данных: либо оставить user_photos и согласовать с тобой, либо перейти на «только media_assets» (type + owner_user_id) и убрать user_photos из схемы.
- Добавить автотесты: успешная загрузка, запись в media_assets, создание preview, отклонение невалидного файла; запуск в CI.

---

## ISSUE 5 — FEATURE: My photos API

### Твоя спецификация

- **Только** GET /api/my/photos и DELETE /api/my/photos/:id.
- Только свои фото; нельзя удалять чужие; формат удобен frontend.
- **Out of scope:** лимит 10, TTL.
- **Autotester:** пользователь видит только свои фото; удаление своего работает; удаление чужого запрещено. Тесты в CI.

### Что сделано в коде

- GET и DELETE уже реализованы в том же PR, что и upload (в одном «Issue 4»).
- Лимит 10 зашит в логику (у тебя — out of scope для Issue 5).

### Вывод и что делать

- Разделение по ишью: Issue 4 = только upload; Issue 5 = только list + delete. В коде уже есть оба блока — нужно только согласовать, что считаем «Issue 4» и «Issue 5» и при необходимости вынести лимит 10 в отдельную задачу.
- Добавить автотесты: только свои фото; удаление своего; запрет удаления чужого; запуск в CI.

---

## Краткая сводка расхождений

| Тема | Спецификация | Сейчас в коде |
|------|----------------|----------------|
| **Issue 2: таблицы** | Только users, media_assets, looks, look_likes, tryon_sessions; без token_transactions, ai_generation_logs, без user_photos (?) | Есть user_photos, token_transactions, ai_generation_logs |
| **Issue 2: media_assets** | original_url, preview_url, storage_key, hash, mime_type, size, width, height, owner_user_id, expires_at, is_deleted | url, owner_id, type, created_at |
| **Issue 2: looks** | title, main_asset_id, status, updated_at | image_asset_id, created_at |
| **Issue 2: tryon_sessions** | person_asset_id, provider, result_image_asset_id, result_video_asset_id, error_message, started_at, completed_at | photo_id→user_photos, result_asset_id, video_asset_id |
| **Issue 3: upload** | Возвращать url + storage_key | Возвращает только url |
| **Issue 3: тесты** | Автотесты в CI | Нет |
| **Issue 4: scope** | Только upload; ответ { id, url, previewUrl }; 2048px + preview 512px | Upload + list + delete; { id, url, createdAt }; 1536px, без preview; лимит 10 |
| **Issue 4: тесты** | Автотесты в CI | Нет |
| **Issue 5: scope** | Только GET + DELETE | Уже есть, но в одном PR с upload |
| **Issue 5: тесты** | Автотесты в CI | Нет |

---

## Что нужно обсудить

1. **Схема БД (Issue 2):**  
   - Делаем одну новую миграцию 002 под твою Core MVP (и при необходимости отказ от 001 на свежих окружениях) или правим 001 и добавляем 002 только с изменениями?  
   - «Мои фото» — только media_assets (type + owner_user_id) или оставляем таблицу user_photos и вносим её в спецификацию?

2. **Storage (Issue 3):**  
   - Договориться о формате возврата upload (например `{ url, storageKey }`) и добавить автотесты в CI.

3. **Issue 4 vs 5:**  
   - Зафиксировать: 4 = только upload (2048 + preview 512, ответ с previewUrl); 5 = только list + delete. Лимит 10 и TTL — отдельная задача/ишью?

4. **Автотесты:**  
   - Где держать (отдельный репо, папка backend/test или ещё), на каком CI запускать и как поднимать БД/Supabase для тестов (docker, testcontainers, тестовый проект Supabase).

После твоего решения по пунктам выше могу предложить конкретные шаги: миграции, правки storage/media API и список тестов под каждый ишью.
