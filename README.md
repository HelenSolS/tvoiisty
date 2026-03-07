
# 👗 твоИИстиль — Stable Version 1.0 (Investor Ready)

Инновационная виртуальная примерочная для Telegram Mini Apps. 
**Статус:** Режим мерчанта, верификация ГУ/Т-Банк, управление товарами — Готово.
 
## 🛡 Инструкция по деплою (Безопасно)
 
Чтобы не скомпрометировать API ключ Gemini и успешно запуститься на показе:

### 1. GitHub (Код)
Просто загрузите файлы в приватный или публичный репозиторий. Код использует `process.env.API_KEY`, поэтому самого ключа в файлах нет.

### 2. Vercel (Хостинг)
1. Создайте проект в Vercel, выбрав ваш репозиторий.
2. **ВАЖНО:** Перед нажатием кнопки "Deploy", откройте раздел **Environment Variables**.
3. Добавьте новую переменную:
   - **Key:** `API_KEY`
   - **Value:** Вставьте ваш ключ от [Google AI Studio](https://aistudio.google.com/app/apikey).
4. Нажмите **Deploy**.

### 3. Telegram Mini App (Запуск)
1. Напишите [@BotFather](https://t.me/botfather).
2. Используйте `/newapp`.
3. Введите URL, полученный от Vercel (например, `https://your-project.vercel.app`).
4. Готово! Теперь ваше приложение доступно внутри Telegram.

## 📂 Функционал V1.0
- **AI Примерочная:** Двухэтапная генерация (анализ + визуализация).
- **Showroom:** Личный кабинет магазина с добавлением/удалением товаров.
- **Verification:** Система подтверждения бизнеса через Госуслуги и Т-Банк ID.
- **Persistence:** Автоматическое сохранение истории и настроек в браузере.
- **Theming:** 3 дизайнерские темы (Бирюза, Лаванда, Персик).

## 🌿 Ветка dev: стабильность и работа после показа

Текущая точка на **dev** считается стабильной для перехода к доработкам фронта по запросу инвестора, если выполнено ниже.

### Что уже сделано в dev
- Качество входных фото для нейросети (960px, качество 0.8).
- Блокировка повторных кликов «Примерить» во время генерации.
- Сохранение каждой примерки в архив (без потери записей).
- Все запросы к API идут через переменную `VITE_API_BASE_URL`.

### Что обязательно для работы dev
- **Бэкенд** доступен по `https://api.tvoiistyle.top` (nginx → backend:3000).
- При деплое фронта (Vercel или иной хостинг) в **Environment Variables** задано:
  - **Key:** `VITE_API_BASE_URL`
  - **Value:** `https://api.tvoiistyle.top`
- После добавления переменной — пересобрать/задеплоить фронт (значение попадает в сборку на этапе build).

### Перед тем как заняться фронтом
Один раз проверить полный сценарий на деплое dev:
1. Загрузка своего фото → успешный ответ от `POST /api/media/upload`.
2. Примерка по образу → `POST /api/tryon` и опрос `GET /api/tryon/:id` до статуса `completed`.
3. Результат появляется на экране и сохраняется в разделе «Архив».

Если всё проходит — можно спокойно заниматься UI/фронтом; бэкенд и домен API не менять.

### Чего не трогать до окончания фронт-работ
- Не менять контракты API (пути, поля запросов/ответов) для загрузки фото и примерки.
- Не отключать и не менять `VITE_API_BASE_URL` на деплое ветки dev.

## 🚀 Деплой backend на VPS через GitHub

Если на сервере в `/opt/tvoiisty` нет Git (только ручные файлы), разверни проект из репозитория так.

### 1. На Mac — запушить ветку dev
```bash
cd /Users/lena/tvoisty
git push origin dev
```

### 2. На сервере — остановить контейнеры, удалить старую папку, клонировать
```bash
cd /opt/tvoiisty
docker compose down

cd /opt
rm -rf tvoiisty

git clone -b dev https://github.com/HelenSolS/tvoiisty.git tvoiisty
cd tvoiisty
```

### 3. На сервере — создать .env
```bash
nano .env
```
Вставить (подставь свои значения пароля и ключей):
```
PGHOST=postgres
PGPORT=5432
PGUSER=tvoiisty
PGPASSWORD=strongpassword
PGDATABASE=tvoiisty_db
JWT_SECRET=твой_длинный_секрет
BLOB_READ_WRITE_TOKEN=...
KIE_API_KEY=...
FAL_KEY=...
```
Сохранить: Ctrl+O, Enter, Ctrl+X.

### 4. Запустить контейнеры
```bash
docker compose up -d --build
```

### 5. Проверка
```bash
curl http://localhost:3000/health
curl -s https://api.tvoiistyle.top/api/media/upload/check
curl -X POST http://localhost:3000/api/media/upload -F "file=@/dev/null" -F "type=person"
```
Первый — должен вернуть `OK`. Второй — `{"storage":"ok"}` или 503 с подсказкой про BLOB/Supabase. Третий — 400 с «Файл не передан» или 503 (хранилище не настроено), но не 502.

### Если загрузка фото даёт 502 Bad Gateway
1. **Логи бэкенда** при попытке загрузки: `docker compose logs backend --tail 50`. Ищи строки `[uploadMedia] failed` или `[express] unhandled error`.
2. **Хранилище:** в `.env` на сервере должен быть `BLOB_READ_WRITE_TOKEN` (Vercel Blob) или Supabase. Проверка: `curl -s https://api.tvoiistyle.top/api/media/upload/check`.
3. **Таймауты Nginx:** если бэкенд отвечает, но долго (Blob/Supabase), Nginx может обрывать запрос. В конфиге Nginx для `location /api/` или для прокси к backend добавь:
   `proxy_read_timeout 60s; proxy_send_timeout 60s; proxy_connect_timeout 10s;`
   Затем `nginx -t` и `systemctl reload nginx`.

---
*Эта версия является финальной для презентации инвестору. Дальнейшие изменения вносить только модульно.*
