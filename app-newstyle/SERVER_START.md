# Запуск backend на сервере — один раз, по шагам

Выполняй **на сервере** по порядку. Не пропускай шаги.

## 1. Остановить всё

```bash
cd /opt/newstyle/newstyle
docker compose down --remove-orphans
docker stop $(docker ps -q) 2>/dev/null || true
```

## 2. Убедиться, что порты свободны

```bash
sudo lsof -i :5434 -i :6379 -i :4001
```

Если что-то висит — запомни PID и убей: `sudo kill -9 PID`. Или перезапусти Docker:

```bash
sudo systemctl restart docker
sleep 5
```

## 3. Файлы на месте

- `/opt/newstyle/newstyle/docker-compose.yml` — с `env_file: .env`, `environment: DATABASE_URL/REDIS_URL`, healthcheck postgres.
- `/opt/newstyle/newstyle/.env` — с ключами, строками `DATABASE_URL=postgres://app:app@postgres:5432/app` и `REDIS_URL=redis://redis:6379`.

Если правил compose вручную — вставь актуальный из репо (postgres порт **5434**, api **4001**).

## 4. Запуск

```bash
cd /opt/newstyle/newstyle
docker compose up -d --build
```

## 5. Подождать и проверить

```bash
sleep 35
docker compose ps
curl -s http://localhost:4001/health
docker compose logs api --tail 20
```

Ожидаем: все 4 контейнера Up, `{"status":"ok"}`, в логах — `Migrations complete` и `Backend listening on 0.0.0.0:4000`.

## 6. Nginx

В `/etc/nginx/sites-available/api` в блоке `location /` должно быть:

```nginx
proxy_pass http://127.0.0.1:4001;
```

Потом: `sudo nginx -t && sudo systemctl reload nginx`.

## 7. Снаружи

```bash
curl -s https://api.tvoiistyle.top/health
```

Должен вернуться `{"status":"ok"}`.
