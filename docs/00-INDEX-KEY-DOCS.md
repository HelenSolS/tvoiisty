# Сводка важных документов (tvoiisty)

Один входной файл: что где лежит и зачем нужно.

---

## Обязательно иметь под рукой

| Документ | О чём |
|----------|--------|
| **FUNCTIONAL-REQUIREMENTS.md** | Функциональные требования: медиа, примерка, видео, очередь, настройки, безопасность. Нумерованные пункты для трейса и приёмки. |
| **api-contract-tryon.md** | Контракт API примерки и загрузки: POST/GET /api/tryon, POST /api/media/upload. Стабильные эндпоинты, не менять без версии. |
| **CANON-PROVIDERS-AND-MODELS.md** | Канон генерации: primary Fal (nano-banana), fallback KIE, только /api/tryon, таймауты, чеклист проверки пайплайна. |
| **ARCHITECTURE-OLD-INTERFACE-AS-IS.md** | Архитектура старого интерфейса как есть: фронт (App.tsx), Express и Vercel API, все сервисы, очередь анализа фото, внешние вызовы. |
| **ARCHITECTURE-MEDIA-AND-SERVICES.md** | Медиа и сервисы: типы картинок, хранилище, БД, внешние API (Fal, KIE, OpenRouter), очередь задач, правила обращения. |
| **SERVER-ARCHITECTURE-AND-IMAGES.md** | Сервер: план Docker (06), текущий compose, обработка примерок, где хранятся фото/образы, как URL уходят в Fal/KIE, поток картинок. |
| **SERVER-TAKEOVER-PLAN.md** | План «забрать сервер под себя»: убрать их 4 контейнера, поднять только наш стек (postgres, redis, backend), nginx на хосте, без конфликтов портов. |
| **PLAN-RECOVERY-ENGINE-AND-UI.md** | План восстановления: наш движок за основу, их фронт (вид для инвестора). Сначала перенос их UI и привязка к нашему API, проверка вида; потом сервер. |
| **SETTINGS-AND-PARAMETERS.md** | Параметры и настройки: глобальные (БД app_settings), локальные админки (localStorage), пользовательские (users.preferences); кто чем управляет, как планировали сделать правильно. |
| **SUCCESS-CRITERIA-WORKING-RULES.md** | Критерии успеха и рабочие правила: не ломаем работающее, идём по плану, проверяем в dev, сложности обсуждаем, каноны чтим; чеклист действий «как вспомнить». |

---

## Поддержка и миграция

| Документ | О чём |
|----------|--------|
| **CANON-OLD-INTERFACE-AND-MIGRATION.md** | Где что починено в старом интерфейсе и чеклист для переноса в новый (tvoiistyle). |
| **deploy-checks.md** | Что проверять при деплое: тесты, health, фронт-сборка. |
| **health-pipeline.md** | Health-check примерки: smoke, health:tryon, переменные, алерты, cron. |
| **06-Infra-DevOps.md** | План инфраструктуры: окружения, Docker Compose (api, worker, postgres, redis, minio, nginx), секреты, логи, бэкапы. |

---

## Ревизия стороннего проекта (newstyle)

| Документ | О чём |
|----------|--------|
| **NEWSTYLE-REVIEW-REMARKS.md** | Замечания по проекту /Users/lena/newstyle: почему не работают примерки с залитыми фото, расхождение миграции 002 и кода, контракт photoId/lookId, что исправить. |

---

## Справочно

| Документ | О чём |
|----------|--------|
| **04-DB-DataModel.md** | Модель данных БД. |
| **05-API-Spec.md** | Спека API (общая). |
| **03-Architecture.md** | Архитектура MVP (принципы, Worker, очередь заданий — часть реализована иначе). |
| **scripts/init-db.sql** | Схема БД для ручного применения. |

---

## Быстрые ссылки по темам

- **Что должна делать система** → FUNCTIONAL-REQUIREMENTS.md  
- **Как дергать API примерки** → api-contract-tryon.md  
- **Какие модели и провайдеры** → CANON-PROVIDERS-AND-MODELS.md  
- **Как устроен старый интерфейс** → ARCHITECTURE-OLD-INTERFACE-AS-IS.md  
- **Где картинки и кто их хранит** → ARCHITECTURE-MEDIA-AND-SERVICES.md + SERVER-ARCHITECTURE-AND-IMAGES.md  
- **Как поднят сервер и Docker** → SERVER-ARCHITECTURE-AND-IMAGES.md + 06-Infra-DevOps.md  
- **Что проверять при деплое** → deploy-checks.md  
- **Чем управляем в админке, глобально и у пользователя** → SETTINGS-AND-PARAMETERS.md  
- **Как восстанавливаем движок (наш) + их вид для инвестора** → PLAN-RECOVERY-ENGINE-AND-UI.md  
- **Критерии успеха, правила работы, как не сбиться** → SUCCESS-CRITERIA-WORKING-RULES.md  

Всё важное из текущей работы собрано в этих документах.
