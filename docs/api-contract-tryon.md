# API Contract: Try-On и Upload

**Правило стабильности:** Эндпоинты `/api/tryon`, `/api/tryon/:id` и `/api/media/upload` считаются стабильными и **не должны изменяться без версии** (например `/api/v2/...`). Новый фронтенд может опираться на этот контракт.

---

## POST /api/tryon

Создаёт сессию примерки. Генерация выполняется асинхронно; результат получают через GET /api/tryon/:id.

**Тело запроса (JSON):**

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `person_asset_id` | string (UUID) | да | ID ассета фото человека (после upload). |
| `look_id` | string (UUID) | нет* | ID образа из БД (looks). |
| `clothing_image_url` | string (URL) | нет* | URL картинки одежды (для статичной витрины). |
| `scene_type` | string | нет | Опционально. |
| `model_name` | string | нет | Модель провайдера. |
| `client_request_id` | string | нет | Идемпотентность при повторной отправке. |

\* Нужен один из: `look_id` или `clothing_image_url`.

**Ответ (201 Created):**

```json
{
  "tryon_id": "uuid",
  "status": "pending"
}
```

Возможные статусы при создании: `pending`, далее при опросе — `processing`, `completed`, `failed`, `cancelled`.

**Ошибки:** 400 (нет person_asset_id / ни look_id, ни clothing_image_url), 200 (если передан client_request_id и сессия уже есть — возвращается существующая).

---

## GET /api/tryon/:id

Возвращает статус и результат сессии примерки.

**Ответ (200 OK):**

**Пока в процессе (processing / pending):**

```json
{
  "status": "processing",
  "image_url": null,
  "video_url": null,
  "error": null
}
```

**Успех (completed):**

```json
{
  "status": "completed",
  "image_url": "https://...",
  "video_url": null,
  "error": null
}
```

**Ошибка (failed):**

```json
{
  "status": "failed",
  "image_url": null,
  "video_url": null,
  "error": "timeout"
}
```

**Ошибки:** 404 — сессия не найдена.

---

## POST /api/media/upload (Upload)

Загрузка файла (фото человека, одежды и т.д.). Используется перед вызовом POST /api/tryon (получить `person_asset_id` или загрузить одежду для статичной витрины).

**Тело:** `multipart/form-data`.

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `file` | file | да | Изображение. |
| `type` | string | нет | `person` \| `clothing` \| `location`. По умолчанию `person`. |

**Ответ (201 Created):**

```json
{
  "assetId": "uuid",
  "type": "person",
  "url": "https://...",
  "hash": "..."
}
```

**Ошибки:** 400 (файл не передан, некорректный type), 502/503 (ошибка хранилища).

---

## Итог

- **POST /api/tryon** — создание сессии; ответ: `tryon_id`, `status`.
- **GET /api/tryon/:id** — опрос; ответ: `status`, `image_url`, `video_url`, `error`.
- **POST /api/media/upload** — загрузка файла; ответ: `assetId`, `url`, `type`, `hash`.

Контракт стабилен; изменения только через версионирование (например `/api/v2/...`).
