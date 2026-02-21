# 05. API (черновой контракт)

## 5.1. Авторизация
### POST /auth/telegram
Вход: `initData` из Telegram Mini App.
Выход: `access_token` (JWT), `user`.

Backend обязан валидировать подпись initData.

## 5.2. Пользователь
### GET /me
### PATCH /me
- смена темы

## 5.3. Фото пользователя
### POST /user-photos
- загрузка (multipart)
- ответ: `user_photo_id` + `image_url`

### GET /user-photos
### DELETE /user-photos/{id}

## 5.4. Каталог образов
### GET /outfits
Query:
- gender
- category
- season
- style
- q (поиск)
- cursor/limit

### GET /outfits/{id}

## 5.5. Локации
### GET /locations
MVP: возвращает активные локации.

## 5.6. Примерка
### POST /tryons
Body:
- user_photo_id
- outfit_id
- location_id (nullable)

Ответ:
- tryon_id
- status

### GET /tryons/{id}
Ответ:
- status
- result_image_url (если готов)
- error (если failed)

### GET /tryons
История пользователя.

## 5.7. Анимация
### POST /animations
Body:
- tryon_id

### GET /animations/{id}

## 5.8. Переходы в магазин (трек)
### POST /events/store-click
Body:
- outfit_id
- store_id
- context: catalog|result|other

## 5.9. Магазин
### POST /store/enable
MVP: заглушка “стать магазином”.

### POST /store/verify
MVP: заглушка подтверждения.

### POST /store/outfits
- загрузка образа
- после загрузки: status=pending_moderation

### GET /store/outfits
### GET /store/stats
- агрегаты: примерки/клики по образам

## 5.10. Админ
### POST /admin/locations
### PATCH /admin/locations/{id}
### POST /admin/moderation/review
(в MVP можно без ручной модерации, но эндпоинт оставить как заглушку)

