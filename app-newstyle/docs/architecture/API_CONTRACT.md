# API Contract — Примерочная

## 1. Загрузка фото

**POST** `/api/media/upload`

### Request

`multipart/form-data`

| Поле   | Тип   | Описание |
|--------|--------|----------|
| `file` | image  | Файл изображения |

### Response

```json
{
  "id": "...",
  "url": "...",
  "createdAt": "..."
}
```

---

## 2. Получить фото пользователя

**GET** `/api/my/photos`

### Response

```json
[
  {
    "id": "...",
    "url": "...",
    "createdAt": "..."
  }
]
```

---

## 3. Удалить фото

**DELETE** `/api/my/photos/:id`

---

## 4. Получить образы

**GET** `/api/looks`

### Response

```json
[
  {
    "id": "...",
    "imageUrl": "...",
    "liked": true
  }
]
```

---

## 5. Лайк образа

**POST** `/api/looks/:id/like`

---

## 6. Примерить образ

**POST** `/api/tryon`

### Request

```json
{
  "lookId": "...",
  "photoId": "..."
}
```

### Response

```json
{
  "sessionId": "..."
}
```

---

## 7. Получить статус примерки

**GET** `/api/tryon/:id`

### Response

```json
{
  "status": "pending | processing | completed | failed",
  "imageUrl": "..."
}
```

**status:**

- `pending`
- `processing`
- `completed`
- `failed`

---

## 8. История примерок

**GET** `/api/history`

### Response

```json
[
  {
    "id": "...",
    "imageUrl": "...",
    "createdAt": "..."
  }
]
```

---

## 9. Генерация видео

**POST** `/api/tryon/:id/video`
