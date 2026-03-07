# Smoke-тесты: жизнеспособность сервера

Проверяют, что сервер поднят и ключевые эндпоинты отвечают ожидаемыми кодами и форматом.

## Что передать автотестеру

- **Команда:** `npm run test:smoke`
- **Переменная окружения (опционально):**
  - `TEST_SERVER_URL` — базовый URL сервера. Если не задана, используется `http://localhost:3000`.

## Примеры запуска

```bash
# Сервер запущен локально на порту 3000
npm run test:smoke

# Проверка деплоя (api.tvoiistyle.top)
TEST_SERVER_URL=https://api.tvoiistyle.top npm run test:smoke
```

## Что проверяется

| Проверка | Ожидание |
|----------|----------|
| `GET /health` | 200, тело `OK` |
| `GET /health/tryon` | 200 или 503, JSON с полями `status`, `db`, `storage`, `providers` |
| `GET /api/media/upload/check` | 200 или 503, JSON с полем `storage` |
| `POST /auth/signup` (email + password) | 201 (создан) или 409 (уже есть) |
| `GET /api/looks` без заголовка Authorization | 401, JSON с полем `error` |
| `POST /api/tryon` с пустым телом | 400, JSON с полем `error` |
| `POST /api/tryon` только с `person_asset_id` | 400, сообщение про look_id/clothing_image_url |

Сервер должен быть **уже запущен** до запуска тестов (локально или удалённо).

Для регулярной проверки **цепочки генерации** (реальная примерка + polling + storage) см. **Health pipeline**: `npm run health:tryon` и [docs/health-pipeline.md](../docs/health-pipeline.md).
