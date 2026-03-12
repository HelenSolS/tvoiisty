# Production deployment (backend + Postgres + Redis + nginx)

Этот документ описывает, как развернуть backend в production на чистом сервере с Docker.

## 1. Требования

- Установлен Docker и Docker Compose (v2+).
- DNS / домен уже указывает на сервер (для 80/443).

## 2. Переменные окружения

В production-compose все необходимые значения уже заданы по умолчанию:

- `DATABASE_URL=postgres://postgres:postgres@postgres:5432/app`
- `REDIS_URL=redis://redis:6379`
- `PORT=3000` (порт внутри контейнера backend)

Если нужно изменить пароль/имя БД, правьте секцию `postgres` и `DATABASE_URL` в
`docker-compose.production.yml` синхронно.

## 3. Сервисы

`docker-compose.production.yml` поднимает:

- `postgres` — Postgres 16, данные лежат в volume `postgres_data`
- `redis` — Redis 7
- `backend` — наш Express‑backend (`server.ts`, собирается из текущего репо)
- `nginx` — единственная точка входа (порты 80 и 443), проксирует `/api` на backend

Порты сервисов внутри сети:

- `postgres:5432` (только внутри Docker‑сети)
- `redis:6379` (только внутри Docker‑сети)
- `backend:3000` (только внутри Docker‑сети)

Снаружи торчат только:

- `80` и `443` (nginx).

## 4. Запуск в production

На чистом сервере достаточно выполнить:

```bash
bash deploy/install-newstyle.sh
```

Скрипт:

- создаст `.env.production`, если его ещё нет,
- соберёт backend‑образ через `docker compose -f docker-compose.production.yml build`,
- поднимет `postgres`, `redis`, `backend`,
- подождёт несколько секунд,
- проверит health `GET http://localhost:3000/api/health`,
- выведет `docker ps`.


