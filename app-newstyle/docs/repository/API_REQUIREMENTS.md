# API_REQUIREMENTS — Требования API для нового backend

Список endpoint’ов, которые нужны утверждённому frontend для интеграции. Новый backend должен реализовать контракт из `docs/architecture/API_CONTRACT.md`; ниже — краткий перечень и привязка к экранам.

---

## 1. Загрузка и фото пользователя

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| POST | `/api/media/upload` | Загрузка пользовательского фото (multipart/form-data, поле `file`). Ответ: `{ id, url, createdAt }`. |
| GET | `/api/my/photos` | Список фото пользователя. Ответ: массив `{ id, url, createdAt }`. Лимит 10, при 11-м удаляется самое старое. |
| DELETE | `/api/my/photos/:id` | Удаление одного фото. |

**Экран:** Step1UploadUser (Мои фото). После интеграции: Dropzone → upload → список из GET; удаление через DELETE.

---

## 2. Образы (looks)

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| GET | `/api/looks` | Список образов для галереи. Ответ: массив `{ id, imageUrl, liked }`. |
| POST | `/api/looks/:id/like` | Поставить или снять лайк. |

**Экран:** Step2UploadClothing. Образы приходят с backend (looks), при выборе образа — вызов try-on с photoId и lookId.

---

## 3. Примерка (try-on)

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| POST | `/api/tryon` | Запуск примерки. Body: `{ lookId, photoId }`. Ответ: `{ sessionId }`. Идемпотентность по требованию. |
| GET | `/api/tryon/:id` | Статус и результат. Ответ: `{ status, imageUrl }`. Статусы: `pending`, `processing`, `completed`, `failed`. |

**Экраны:** Step2 (кнопка «примерить» → POST), Step3Result (polling GET до completed/failed, показ imageUrl).

---

## 4. История примерок

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| GET | `/api/history` | Список завершённых примерок. Ответ: массив `{ id, imageUrl, createdAt }` (и при необходимости videoUrl, если хранится одно видео на результат). |

**Экран:** LookScroller. Данные для списка и карточек (открыть, скачать, поделиться, видео).

---

## 5. Видео

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| POST | `/api/tryon/:id/video` | Запуск генерации видео по результату примерки `:id`. Видео сохраняется в нашем storage; у результата доступно только последнее. |

**Экраны:** Step3Result (кнопка «Создать видео»), Step4Video (просмотр). После интеграции: вызов POST, затем получение URL видео через GET tryon или history.

---

## 6. Сводный список endpoint’ов

1. `POST /api/media/upload` — загрузка фото  
2. `GET /api/my/photos` — список моих фото  
3. `DELETE /api/my/photos/:id` — удалить фото  
4. `GET /api/looks` — список образов  
5. `POST /api/looks/:id/like` — лайк образа  
6. `POST /api/tryon` — запуск примерки  
7. `GET /api/tryon/:id` — статус и результат примерки  
8. `GET /api/history` — история примерок  
9. `POST /api/tryon/:id/video` — генерация видео по результату  

Форматы request/response — по `docs/architecture/API_CONTRACT.md`. Реализация — только на выделенном backend (не Vercel/serverless), с очередями, storage и Fal/KIE по архитектурным документам.
