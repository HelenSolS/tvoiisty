# Канон: провайдеры и модели (не менять без явного решения)

Эти настройки — база для старого и нового интерфейса. Менять только по решению команды.

**Где починены каноны на старом интерфейсе и чеклист для переноса в новый:** см. `docs/CANON-OLD-INTERFACE-AND-MIGRATION.md`.

---

## Канон генерации (примерка) — не менять

- **PRIMARY_MODEL** = `fal-ai/nano-banana-pro/edit` (Fal nano-banana).
- **FALLBACK_MODEL** = KIE nano-banana.
- **Endpoint:** только `POST /api/tryon` (подмена virtual-try-on → nano-banana только в этом пайплайне; видео и другие эндпоинты не трогаем).
- **Pipeline:** frontend → backend → Fal → при ошибке (не таймаут): retry Fal 1 раз при network error, затем fallback KIE → доставка картинки (mirror в storage, при сбое storage — URL провайдера в result_meta).
- **Таймауты:** Fal poll 70s, фронт polling max 90s (чтобы не закрыть ожидание раньше бэкенда).
- **Provider URL в result_meta** — только fallback при сбое mirror; основной источник — asset в нашем хранилище (URL провайдера может иметь ограниченный TTL).
---

## Примерка (картинка)

| Роль | Провайдер | Модель по умолчанию |
|------|-----------|----------------------|
| **Основная** | **Fal** | `fal-ai/nano-banana-pro/edit` (nano banana) |
| **Вспомогательная / fallback** | **KIE** | nano banana (в KIE — как настроено); третьей пока нет, в планах есть |

**Порядок:** первичен Fal, вторичен KIE. При сбое Fal вызывается KIE.

Выбор моделей руками доступен в настройках, если пользователь открывает себе эту функцию (выпадающий список моделей).

---

## Видео

| Роль | Провайдер | Модель по умолчанию |
|------|-----------|----------------------|
| **Основная** | **KIE** | Grok — `grok-imagine/image-to-video` |
| **Запасная** | **KIE** | Kling v2-1 standard — `kling/v2-1-standard` |

Выбор модели видео руками — через настройки (если включён выбор моделей).

---

## Где задаётся

- **Бэкенд (сервер):** `app_settings.DEFAULT_IMAGE_MODEL`, `DEFAULT_VIDEO_MODEL`, `ENABLED_IMAGE_PROVIDER`; при отсутствии — дефолты в `backend/settings.ts` и в коде (Fal nano-banana, Grok).
- **Фронт (админка):** `services/adminSettings.ts` — дефолты для UI; при `imageModelChoice: 'default_only'` / `videoModelChoice: 'default_only'` на главной показывается только дефолтная модель, выбор списком — в настройках/лаборатории.

---

## Кратко

- **Примерка:** Fal (nano banana) → при сбое KIE (nano banana). Ручной выбор моделей — в настройках.
- **Видео:** KIE Grok → запасная KIE Kling v2-1 standard. Ручной выбор — в настройках.

---

## Тесты канона (примерка)

Проверка порядка провайдеров и fallback при ошибках: `tests/tryon-fallback.test.ts`.

- При ошибке Fal (не таймаут) — вызывается KIE, результат с `providerUsed === 'kie'`.
- При rate_limit / квота / токены Fal — то же: fallback на KIE.
- При таймауте Fal — fallback не вызывается (не дублируем запрос).

Запуск: `npm run test:canon`.

---

## Чеклист проверки пайплайна (4 сценария)

Перед релизом убедиться:

| Сценарий | Вход | Ожидание |
|----------|------|----------|
| Демо-образ | person_asset_id + образ с https (витрина) | completed, image_url |
| Образ из каталога (look) | person_asset_id + look_id | completed, image_url |
| Одежда магазина | person_asset_id + clothing_image_url (https после загрузки) | completed, image_url |
| Новое фото пользователя | person_asset_id (только что загружен) + любой образ | completed, image_url |
| Storage выключен/ошибка | любой успешный tryon | completed, image_url из result_meta (URL провайдера) |
