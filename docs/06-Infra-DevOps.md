# 06. Инфраструктура и DevOps

## 6.1. Окружения
- `dev` — для разработки.
- `test` — для стабилизации (предрелиз).
- `prod` — только из main.

## 6.2. Деплой
MVP вариант (минимум DevOps):
- Front: Vercel.
- API + Worker + DB + Storage: один VPS с Docker Compose.

Позже: разделение по серверам (RF/KZ), балансировщики, очереди.

## 6.3. Docker Compose (обязательные сервисы)
- api
- worker
- postgres
- redis (для очереди)
- minio (S3 storage)
- nginx (reverse proxy + SSL)

## 6.4. Секреты и конфиги
Хранить в GitHub Secrets и .env на сервере.
Нельзя коммитить:
- API keys провайдеров AI
- JWT secret
- доступ к S3

## 6.5. Логи и мониторинг
Минимум:
- структурные логи api/worker (json)
- сохранение логов минимум 7 дней

Желательно:
- Sentry для фронта и бэка
- Uptime robot

## 6.6. Бэкапы
- Postgres ежедневный дамп
- S3/MinIO: versioning или бэкап бакетов

## 6.7. Безопасность
- rate limit на публичные эндпоинты
- ограничение размеров upload
- CORS только для доменов приложения

