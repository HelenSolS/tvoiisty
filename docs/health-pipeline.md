# Tryon health-check pipeline (автотестер генерации)

Регулярная проверка цепочки: **API → Route → Engine → Provider → Storage → DB**. Нужна, чтобы ловить деградации (Fal/KIE недоступны, таймауты, 500, отсутствие результата).

## 1. Команды

| Команда | Назначение |
|--------|------------|
| `npm run test:smoke` | Быстрые проверки без реальной примерки (health, upload/check, signup, looks 401, tryon 400). Сервер должен быть запущен. |
| `npm run health:tryon` | Полный прогон: одна реальная примерка, polling до completed, проверка image_url и storage. Требует `HEALTH_PERSON_ASSET_ID` и `HEALTH_LOOK_ID`. |

## 2. Переменные окружения

### Для `npm run health:tryon`

- **Обязательные** (иначе скрипт выходит с ошибкой без вызова API):
  - `HEALTH_PERSON_ASSET_ID` — UUID фото человека в `media_assets` (type=person).
  - `HEALTH_LOOK_ID` — UUID образа в `looks`.

- **Опциональные**:
  - `TEST_SERVER_URL` — базовый URL API (по умолчанию `http://localhost:4000`).
  - `HEALTH_POLL_MAX_SEC` — макс. секунд ожидания `completed` (по умолчанию 90).
  - `HEALTH_REPORT_FILE` — путь к файлу, куда пишется JSON-отчёт.
  - `HEALTH_STATE_FILE` — файл счётчика подряд идущих неудач (по умолчанию `.health-tryon-state.json`).
  - `HEALTH_ALERT_AFTER_FAILURES` — после скольких подряд неудач слать алерт (по умолчанию 3).
  - `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` — для алертов в Telegram.

### Для smoke

- `TEST_SERVER_URL` — базовый URL (по умолчанию `http://localhost:3000` в тестах; для бэкенда часто `http://localhost:4000`).

## 3. Что проверяется

- **Smoke** (`test:smoke`): GET /health, GET /api/media/upload/check, POST /auth/signup, GET /api/looks → 401, POST /api/tryon с пустым/неполным body → 400.
- **Health tryon** (`health:tryon`):
  1. POST /api/tryon → 201, есть `tryon_id`.
  2. Polling GET /api/tryon/:id до статуса `completed` или таймаута.
  3. В ответе есть `image_url`.
  4. По этому URL отдаётся 200 (HEAD) — проверка storage.

## 4. Отчёт health:tryon

В stdout (и при заданном `HEALTH_REPORT_FILE` — в файл) пишется JSON, например:

- Успех: `{ "timestamp": "...", "test": "tryon_health_check", "status": "ok", "tryon_id": "...", "image_url": "...", "duration_seconds": 22 }`
- Ошибка: `{ "status": "error", "stage": "engine"|"route"|"polling"|"storage", "error": "...", "duration_seconds": ... }`

## 5. Алерты

При `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` после `HEALTH_ALERT_AFTER_FAILURES` подряд неудач в Telegram уходит сообщение вида:

```
TRYON HEALTH ALERT
Status: FAILED
Stage: engine
Error: timeout
Time: 2026-03-07 20:15
```

## 6. Как запускать регулярно

- **Cron** (каждые 15 минут):
  ```bash
  */15 * * * * cd /path/to/tvoisty && HEALTH_PERSON_ASSET_ID=... HEALTH_LOOK_ID=... TEST_SERVER_URL=https://api.tvoiistyle.top npm run health:tryon >> /var/log/tryon-health.log 2>&1
  ```
- **GitHub Actions**: workflow по расписанию (например каждые 30 мин), с подстановкой `TEST_SERVER_URL` и секретов `HEALTH_PERSON_ASSET_ID`, `HEALTH_LOOK_ID`; при exit code 1 можно слать в Slack/Telegram через step.

## 7. Endpoint для мониторинга

- **GET /health** — простой 200 OK (nginx/Docker).
- **GET /health/tryon** — проверка готовности цепочки tryon:
  - `db` — доступность БД (SELECT 1).
  - `storage` — настроен ли Blob или Supabase.
  - `providers` — список доступных провайдеров (kie, fal по наличию ключей).

Ответ 200 при `status: "ok"`, 503 при `status: "degraded"` (нет БД, storage или провайдеров).
