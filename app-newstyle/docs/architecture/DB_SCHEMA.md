# DB Schema — Примерочная

## Таблицы

### users

| Колонка    | Тип        |
|------------|------------|
| id         | PK         |
| created_at | timestamp  |

---

### media_assets

| Колонка    | Тип        |
|------------|------------|
| id         | PK         |
| type       | enum/string |
| url        | string     |
| created_at | timestamp  |
| owner_id   | FK → users |

---

### user_photos

| Колонка    | Тип        |
|------------|------------|
| id         | PK         |
| user_id    | FK → users |
| asset_id   | FK → media_assets |
| created_at | timestamp  |

---

### looks

| Колонка        | Тип        |
|----------------|------------|
| id             | PK         |
| image_asset_id | FK → media_assets |
| created_at     | timestamp  |

---

### look_likes

| Колонка    | Тип        |
|------------|------------|
| user_id    | FK → users |
| look_id    | FK → looks |
| created_at | timestamp  |

*(Составной PK: user_id, look_id)*

---

### tryon_sessions

| Колонка         | Тип        |
|-----------------|------------|
| id              | PK         |
| user_id         | FK → users |
| photo_id        | FK → user_photos / media_assets |
| look_id         | FK → looks |
| status          | enum       |
| result_asset_id | FK → media_assets (nullable) |
| video_asset_id  | FK → media_assets (nullable) |
| created_at      | timestamp  |

---

### token_transactions

| Колонка    | Тип        |
|------------|------------|
| id         | PK         |
| user_id    | FK → users |
| amount     | number     |
| reason     | string     |
| created_at | timestamp  |

---

### ai_generation_logs

| Колонка    | Тип        |
|------------|------------|
| id         | PK         |
| provider   | string     |
| duration   | number     |
| status     | string     |
| created_at | timestamp  |
