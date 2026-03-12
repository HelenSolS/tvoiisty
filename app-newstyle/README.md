# Newstyle UI на нашем API (Фаза 1)

Интерфейс из проекта newstyle, привязанный к бэкенду tvoiisty.

## Запуск в dev

1. **Поднять бэкенд tvoiisty** (порт 4000):
   ```bash
   cd /path/to/tvoiisty && npm run server
   ```
   Нужны postgres, redis (по необходимости), `.env` с Fal, KIE, хранилищем.

2. **Поднять фронт**:
   ```bash
   cd app-newstyle && npm install && npm run dev
   ```
   Откроется http://localhost:3000. Запросы к API идут на http://localhost:4000 (из `src/api/client.ts`: в dev используется `http://localhost:4000`).

## Что подключено

- **GET /api/looks** — список образов (без авторизации для демо), ответ `{ looks: [{ id, imageUrl, ... }] }`.
- **POST /api/media/upload** — загрузка фото человека (`type=person`) и одежды (`type=clothing`). Ответ: `assetId`, `url`.
- **POST /api/tryon** — тело: `person_asset_id`, `look_id` и/или `clothing_image_url`. Ответ: `tryon_id`, `status`.
- **GET /api/tryon/:id** — статус и `image_url` результата.
- **GET /api/history** — история примерок (требуется авторизация Bearer). При 401 показывается пустая история.
- **GET /api/my/photos** — у нашего бэкенда нет; при 404 считаем пустой список.

Видео по сессии (`POST /api/tryon/:id/video`, `GET /api/tryon/:id/video-status`) пока не подключены к нашему API.
