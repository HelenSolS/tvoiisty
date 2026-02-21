# 04. Модель данных (Postgres)

## 4.1. Основные сущности
### User
- id
- telegram_id (unique)
- display_name
- theme: mint|peach|lavender
- role: user|store|admin
- created_at

### Store
- id
- owner_user_id (FK User)
- status: draft|pending_verification|verified|blocked
- title
- store_url (основная ссылка)
- created_at

### Outfit (образ)
- id
- store_id (FK Store)
- status: draft|pending_moderation|active|rejected
- title
- image_url (главная картинка)
- image_urls (опционально дополнительные)
- tags (массив строк)
- gender: women|men|kids
- category: dress|pants|skirt|suit|shoes|other
- season: summer|demi|winter|unknown
- style: casual|sport|classic|evening|unknown
- store_url (ссылка именно на этот образ/подборку)
- created_at

### Location
- id
- status: active|disabled
- title
- image_url
- tags
- created_at

### UserPhoto
- id
- user_id (FK)
- status: active|deleted
- image_url
- meta_json (width, height, mime, checksum)
- created_at

### TryOnJob
- id
- user_id
- user_photo_id
- outfit_id
- location_id (nullable)
- status (единый словарь)
- provider (какой AI)
- cost_tokens (int)
- result_image_url (nullable)
- error_code, error_message (nullable)
- created_at, updated_at

### AnimationJob
- id
- user_id
- tryon_id
- status
- provider
- cost_tokens
- result_video_url
- preview_image_url
- error_code, error_message
- created_at, updated_at

### TokenLedger (учёт токенов)
- id
- user_id
- delta (может быть отрицательный)
- reason: tryon|animation|purchase|refund|admin_adjust
- ref_type/ref_id (ссылка на tryon/animation)
- status: pending|settled|canceled
- created_at

## 4.2. События аналитики
Нужен EventLog (или отдельные таблицы) для:
- OutfitViewed
- TryOnStarted
- TryOnCompleted
- StoreClicked

Поля:
- id
- event_type
- user_id (nullable)
- store_id/outfit_id (nullable)
- payload_json
- created_at

## 4.3. Индексация
Минимум индексов в MVP:
- user.telegram_id
- outfit: (status, gender, category)
- tryon: (user_id, created_at)
- events: (event_type, created_at), (store_id)

## 4.4. Требования к описаниям (индексация)
Задача при модерации:
- сохранить “плоское” текстовое описание `search_text` (title + tags + сезон + стиль)
- это позволяет быстрый поиск без обращения к AI.

