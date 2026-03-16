## Backend / DB конфигурация: prod vs dev

Этот файл фиксирует **текущую договорённость** по окружениям, чтобы не путаться и не трогать прод при работе с dev.

### 1. Имена проектов (важно не путать)

- **Локальный репозиторий кода**: `tvoiisty`
- **Vercel‑проект (новый фронт)**: `tvoiisty888`

Эти названия являются каноничными и **никогда не меняются в конфигурации**.

---

### 2. Prod окружение (main)

- **Код / compose-папка**: `/opt/tvoiisty`
- **Docker Compose проект**: `tvoiisty` (по умолчанию, без `-p`)
- **Основные сервисы**:
  - `backend`
  - `postgres`
  - `redis`
- **Имена контейнеров (типично)**:
  - `tvoiisty_backend`
  - `tvoiisty_postgres`
  - `tvoiisty_redis`
- **Backend prod**:
  - Порт внутри контейнера: `3000` (как в текущем коде)
  - Проксируется через nginx на домен:
    - **`https://api.tvoiistyle.top`**
- **БД prod**:
  - Имя БД: `app` (по факту из прошлых проверок)
  - Роль/пользователь: `postgres` (для ручных миграций), плюс то, что прописано в prod `.env`
  - Таблица `tryon_sessions` уже содержит «новые» колонки (owner_type, owner_key, liked, viewed_at и т.п.) — они были добавлены через `ALTER TABLE`, и **эти изменения не откатывались**.
- **Redis prod**:
  - Дефолтный инстанс Redis из `tvoiisty_redis`
  - URL внутри backend-а определяется текущими prod-настройками (`REDIS_URL` и т.п. из `.env`)

> Важно: **код и конфиги в `/opt/tvoiisty` считаются продовыми**. Мы их не меняем при работе над dev.

---

### 3. Dev окружение (план / целевая конфигурация)

Dev-окружение поднимается **в отдельной папке и отдельным docker-compose проектом**, чтобы не мешать prod.

- **Код / compose-папка dev**: `/opt/tvoiisty-dev`
- **Docker Compose проект**: `tvoiisty-dev`
  - запуск: `cd /opt/tvoiisty-dev && docker compose -p tvoiisty-dev up -d --build`
- **Основные сервисы в dev-compose**:
  - `backend`
  - `postgres`
  - `redis`
- **Имена контейнеров dev**:
  - `tvoiisty-dev_backend`
  - `tvoiisty-dev_postgres`
  - `tvoiisty-dev_redis`

#### 2.1. Dev backend

- Порт внутри контейнера: `4000`  
  (задаётся через `PORT=4000` в `.env.dev` и/или `environment` в compose)
- Публикуемый порт (для curl с хоста и Nginx):
  - `ports: ["4000:4000"]`
- Домен для dev API:
  - **`https://api-dev.tvoiisty.top`**
- Nginx (отдельный server-блок, не трогаем продовый):

```nginx
server {
    listen 80;
    server_name api-dev.tvoiisty.top;

    location / {
        proxy_pass http://tvoiisty-dev_backend:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 2.2. Dev БД

- Сервис в compose: `postgres`
- Объём данных:
  - `./pgdata-dev:/var/lib/postgresql/data`
- Параметры БД dev:
  - Имя БД: **`app_dev`**
  - Пользователь: **`tvoiisty_dev`**
  - Пароль: **`tvoiisty_dev_password`**
- Вариант настроек в `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: app_dev
      POSTGRES_USER: tvoiisty_dev
      POSTGRES_PASSWORD: tvoiisty_dev_password
    volumes:
      - ./pgdata-dev:/var/lib/postgresql/data
```

- **DATABASE_URL для dev-backend (внутри контейнера)**:

```env
DATABASE_URL=postgres://tvoiisty_dev:tvoiisty_dev_password@postgres:5432/app_dev
```

Либо отдельные PG\* переменные:

```env
PGHOST=postgres
PGPORT=5432
PGDATABASE=app_dev
PGUSER=tvoiisty_dev
PGPASSWORD=tvoiisty_dev_password
```

#### 2.3. Dev Redis

- Сервис: `redis`
- Объём: `./redisdata-dev:/data`
- Используем отдельный logical DB, например `1`:

```env
REDIS_URL=redis://redis:6379/1
```

В compose:

```yaml
services:
  redis:
    image: redis:7
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - ./redisdata-dev:/data
```

---

### 4. Связка фронтов с API

- **Prod frontend (Vercel, ветка `main`)**:
  - `API_URL=https://api.tvoiistyle.top`
  - Ходит в prod-backend (`/opt/tvoiisty` → `tvoiisty_backend` → БД `app`)

- **Dev frontend (Vercel, ветка `dev`, домены `tvoiisty888-git-dev-...`)**:
  - `API_URL=https://api-dev.tvoiisty.top`
  - Должен ходить в dev-backend (`/opt/tvoiisty-dev` → `tvoiisty-dev_backend` → БД `app_dev`)

---

### 5. Жёсткие правила, чтобы не сломать prod

1. **Никогда не редактировать `/opt/tvoiisty` при работе над dev**:
   - никакого `git pull`, `docker compose up`, правок `.env` и т.п. в этой папке, если цель — dev.
2. **Все эксперименты с `/api/animate`, video prompt flow, `animation_status`, `result_video_url`**:
   - сначала попадают в код, развёрнутый в `/opt/tvoiisty-dev`,
   - используют только БД `app_dev` и Redis dev.
3. **Nginx**:
   - prod-конфиг для `api.tvoiistyle.top` не трогаем,
   - для dev — только добавляем отдельный server-блок для `api-dev.tvoiisty.top` и делаем `nginx -s reload`.
4. **Миграции БД**:
   - новые `ALTER TABLE` / `CREATE TABLE` сначала обкатываются на `app_dev`,
   - только после стабильности и явного решения — аккуратно переносятся в prod (БД `app`).

---

### 6. Как быстро свериться

Если что-то непонятно в будущем:

- **Где крутится prod-backend?** → `/opt/tvoiisty`, проект `tvoiisty`, домен `api.tvoiistyle.top`, БД `app`.
- **Где крутится dev-backend?** → `/opt/tvoiisty-dev`, проект `tvoiisty-dev`, домен `api-dev.tvoiisty.top`, БД `app_dev`.
- **Какая БД сейчас используется dev-кодом?** → смотри `DATABASE_URL` / PG\* в `.env.dev` и окружении `backend` в `/opt/tvoiisty-dev/docker-compose.yml`.

