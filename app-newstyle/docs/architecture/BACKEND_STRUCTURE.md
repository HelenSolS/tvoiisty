# BACKEND_STRUCTURE — Структура backend для Примерочная

Документ описывает целевую структуру backend и **один критичный архитектурный момент**, который должен быть заложен с самого начала.

---

## 1. Критичный архитектурный момент (сделать правильно сразу)

**API и Workers — разные роли и разные точки входа.**

- **API** только: принимает HTTP, создаёт/обновляет сущности в БД (sessions, записи в media_assets), **ставит задачи в очередь**, возвращает ответ клиенту. Никаких вызовов Fal/KIE, никакой долгой генерации в обработчике запроса.
- **Workers** только: забирают задачи из очереди, вызывают AI, пишут в storage, обновляют сессию/asset. Не обрабатывают HTTP.

Если это не зафиксировать с первого дня, легко скатиться к «всё в одном хендлере» и вызывать AI из route — тогда таймауты, блокировки, невозможность retry/fallback по канону.

**Что сделать сразу при bootstrap:**

- Иметь **два явных входа**: процесс API (`src/index.ts` или `server.ts`) и процесс Workers (`src/worker.ts` или `workers/run.ts`). Либо один процесс, но с чётким разделением модулей: `api/` не импортирует логику вызова AI, `workers/` не обрабатывает HTTP.
- Папки и импорты должны делать нарушение правил очевидным (например, в `api/` нет falClient, kieClient; в `workers/` нет express).

---

## 2. Оптимальная структура backend

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts              # Точка входа API: запуск Express
│   ├── worker.ts             # Точка входа Workers: запуск BullMQ workers (подключить на этапе 4)
│   ├── app.ts                # Express app: middleware, подключение маршрутов
│   │
│   ├── api/                  # Всё, что касается HTTP. Только создание записей и enqueue.
│   │   ├── routes/           # Маршруты по контракту API
│   │   │   ├── health.ts
│   │   │   ├── media.ts      # upload, my photos
│   │   │   ├── looks.ts
│   │   │   ├── tryon.ts
│   │   │   ├── history.ts
│   │   │   └── ...
│   │   └── middleware/      # auth, error handler, validation
│   │
│   ├── workers/             # Обработчики очередей. Вызов AI, storage, обновление сессий.
│   │   ├── run.ts           # Регистрация и запуск всех воркеров (вызывается из worker.ts)
│   │   ├── uploadQueue.ts
│   │   ├── tryonQueue.ts
│   │   ├── videoQueue.ts
│   │   └── cleanupQueue.ts
│   │
│   ├── services/            # Общая бизнес-логика и интеграции (используют и api, и workers)
│   │   ├── storage.ts       # Абстракция над Supabase Storage — все медиа только через него
│   │   ├── queue.ts         # Создание очередей BullMQ, add job (используется из api)
│   │   └── db.ts            # Клиент PostgreSQL
│   │
│   ├── lib/                 # Утилиты без побочных эффектов (конфиг, валидация, форматы)
│   │   └── config.ts
│   │
│   └── providers/           # Вызовы внешних AI (только из workers, не из api)
│       ├── falTryon.ts
│       └── kieTryon.ts
│
└── migrations/              # Явные миграции БД (этап 2)
    └── ...
```

**Правила по слоям:**

- **api/** — импортирует `services/queue`, `services/db`, `services/storage` (только методы «сохранить метаданные», «получить URL»). Не импортирует `providers/` и не вызывает долгие операции.
- **workers/** — импортирует `services/queue`, `services/db`, `services/storage`, `providers/`. Обрабатывает job, по окончании обновляет tryon_sessions / media_assets.
- **services/storage** — единственная точка записи/чтения медиа в Supabase; все пути к файлам и публичные URL идут через неё.
- **services/queue** — создание очередей и add job; процесс workers подключает обработчики к этим же очередям.

Так структура сразу отражает каноны: Queue-first, Asset-driven, Mirror-first, Session-based try-on, и разделение API и Workers.

---

## 3. Соответствие этапам roadmap

| Этап | Что добавляется в структуру |
|------|-----------------------------|
| 1 — bootstrap | `index.ts`, `worker.ts` (заглушка), `app.ts`, `api/routes/health`, `lib/config` |
| 2 — DB schema | `migrations/`, `services/db.ts` |
| 3 — storage layer | `services/storage.ts` |
| 4 — очереди | `services/queue.ts`, `workers/run.ts` + скелеты воркеров |
| 5–9 | Реализация маршрутов и воркеров по контракту |
| 10 | Подключение frontend к API |

---

## 4. Итог

- **Один критичный момент:** с первого дня разделять API и Workers (два входа и запрет на вызов AI из api).
- **Оптимальная структура:** `api/` (только HTTP и enqueue), `workers/` (только очереди и AI), `services/` (storage, queue, db), `providers/` (Fal/KIE только из workers), `migrations/` для БД.

После твоего подтверждения буду ориентироваться на эту структуру при выполнении Issue 1 (bootstrap) и следующих ишью.
