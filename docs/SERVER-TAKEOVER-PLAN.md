# План по серверу: забрать хост под наш стек, без конфликтов портов

Цель: на одном VPS работать только наш бэкенд (tvoiisty): три контейнера, один порт наружу, nginx на хосте. Их четыре контейнера и блокировки портов убрать.

---

## 1. Что у нас в итоге должно быть

| Компонент | Где | Порт наружу |
|-----------|-----|-------------|
| **nginx** | На хосте (не в Docker) | 80, 443 |
| **backend** (Express) | Контейнер tvoiisty_backend | 3000 (пробрасывается на хост, снаружи не открыт — только через nginx) |
| **postgres** | Контейнер tvoiisty_postgres | нет (только внутри Docker-сети) |
| **redis** | Контейнер tvoiisty_redis | нет (только внутри Docker-сети) |

Хранилище медиа — внешнее: Supabase Storage или Vercel Blob (не контейнеры на этом сервере).

Итого: снаружи открыты только **80** и **443** (nginx). Порт **3000** слушает только localhost (nginx проксирует на него).

---

## 2. Пошаговый план (забрать сервер под себя)

### Шаг 1. Остановить и убрать их контейнеры

На сервере перейти в директорию их проекта и остановить их Compose, чтобы освободить порты и убрать конфликты:

```bash
cd /path/to/newstyle  # или где у них docker-compose
docker compose down
# При необходимости удалить их образы/volumes, если порты всё ещё заняты:
# docker compose down -v
```

Проверить, что порты 80, 443, 3000 и те, что они использовали (5432, 6379 и т.д.), свободны:

```bash
sudo ss -tlnp | grep -E ':80|:443|:3000|:5432|:6379'
# или
sudo lsof -i :3000
```

Если что-то висит — остановить соответствующий сервис или их контейнеры по имени.

### Шаг 2. Разместить наш проект на сервере

Клонировать или скопировать репозиторий tvoiisty в выбранную директорию (например `/opt/tvoiisty`):

```bash
sudo mkdir -p /opt/tvoiisty
sudo chown "$USER" /opt/tvoiisty
git clone <url-репо-tvoiisty> /opt/tvoiisty
cd /opt/tvoiisty
```

Либо скопировать уже готовую папку tvoiisty (с backend, docker-compose.yml, Dockerfile, package.json и т.д.).

### Шаг 3. Настроить .env на сервере

В `/opt/tvoiisty` создать или скопировать `.env` из примера. Обязательно задать:

- **DATABASE_URL** — не нужен, если используем контейнерный postgres (backend подхватывает PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE из docker-compose).
- **PGPASSWORD** — пароль Postgres (тот же, что в compose).
- **FAL_KEY**, **KIE_API_KEY**, **KIE_BASE_URL** — для примерки.
- **SUPABASE_URL**, **SUPABASE_SERVICE_KEY**, **SUPABASE_BUCKET** и/или **BLOB_READ_WRITE_TOKEN** — хранилище медиа.

Остальное по необходимости (OPENROUTER для анализа фото, JWT secret и т.д.). Не коммитить .env в репозиторий.

### Шаг 4. Запустить только наш Docker Compose

В корне tvoiisty:

```bash
cd /opt/tvoiisty
docker compose up -d --build
```

Проверить:

- Контейнеры: `docker compose ps` — postgres, redis, backend в состоянии Up.
- Backend слушает 3000: `curl -s http://localhost:3000/health` → `{"status":"ok"}`.
- Загрузка: `curl -s http://localhost:3000/api/media/upload/check` → 200 и `storage: ok` при настроенном хранилище.

Postgres и Redis **не пробрасываются** на хост в нашем compose (только `expose`), поэтому порты 5432 и 6379 снаружи не заняты и не конфликтуют с другими установками.

### Шаг 5. Настроить nginx на хосте

Установить nginx, если ещё нет: `sudo apt install nginx` (или аналог). Создать конфиг виртуального хоста для API (например `api.tvoiistyle.top`):

- Проксирование на `http://127.0.0.1:3000`.
- Увеличенные таймауты для upload и долгих ответов примерки (например `proxy_read_timeout 90s; proxy_send_timeout 90s;` для `location /api/`).
- SSL (certbot или свой сертификат).

Пример фрагмента для API:

```nginx
server {
  listen 80;
  server_name api.tvoiistyle.top;
  # редирект на HTTPS при необходимости

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_send_timeout 90s;
    proxy_read_timeout 90s;
  }
}
```

Проверка и перезагрузка:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

После этого весь внешний трафик идёт на 80/443, nginx один раздаёт и проксирует на наш backend на 3000 — никаких лишних открытых портов и конфликтов с их старыми контейнерами.

### Шаг 6. Деплой и обновления

Использовать наш скрипт (подставить свой путь и ветку):

```bash
cd /opt/tvoiisty
git pull origin main   # или dev
docker compose up -d --build
curl -s http://localhost:3000/health
```

Или вынести это в `scripts/deploy-on-server.sh` и вызывать его по SSH.

---

## 3. Почему порты не будут блокироваться

- Запущен **один** Docker Compose — наш. Их контейнеры остановлены и не конкурируют за порты.
- Наружу с хоста торчит только **nginx** (80, 443). Backend слушает **3000** только на localhost (binding в compose можно явно задать как `127.0.0.1:3000:3000`, чтобы снаружи 3000 не был доступен).
- Postgres и Redis **не пробрасываются** на хост — они только в сети docker-compose, порты 5432 и 6379 снаружи свободны.

Если позже понадобится что-то ещё (например второй проект), держать его в другом compose в другой директории и не пересекать порты (например тот проект — другой порт приложения, свой nginx upstream или другой поддомен).

---

## 4. Чеклист перед «го в прод»

- [ ] Их docker compose остановлен (`docker compose down` в их папке).
- [ ] Порты 80, 443, 3000 свободны или заняты только нашим nginx и backend.
- [ ] В `/opt/tvoiisty` лежит наш код, есть `.env` с ключами и хранилищем.
- [ ] `docker compose up -d --build` — три сервиса в Up.
- [ ] `curl http://localhost:3000/health` → `{"status":"ok"}`.
- [ ] `curl https://api.tvoiistyle.top/health` (или ваш домен) → тот же ответ.
- [ ] `curl https://api.tvoiistyle.top/api/media/upload/check` → 200 и признак доступности хранилища.
- [ ] Фронт (их UI, привязанный к нашему API) в настройках указывает на `https://api.tvoiistyle.top` (или ваш URL).

После этого сервер соответствует нашим планам (наш бэкенд, наш compose, nginx, внешнее хранилище), работает предсказуемо и без конфликтов портов с их старым стеком.
