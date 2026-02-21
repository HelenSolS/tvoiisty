# QA: проверка PR #8 — лаборатория, пул моделей, dropdown

**PR:** [feat(dev): лаборатория — пул моделей KIE, dropdown, логирование (fixes #7)](https://github.com/HelenSolS/tvoiisty/pull/8)

**Задача по PR:**
- Image: пул 6 моделей, приём `model` в body, один ключ KIE
- Video: пул 6 моделей, veo-3-1 по умолчанию везде, расширенный промпт для Veo
- Lab UI: выбор модели из выпадающего списка (image + video), без primary/backup
- Логирование: model, startTs, endTs, durationMs, httpStatus, creditsUsed, errorMessage
- Лаборатория только при `import.meta.env.DEV` (скрыта в production)
- Убран переключатель Основной/Резервный из настроек
- docs/LAB.md: инструкция по лаборатории; vite-env.d.ts для import.meta.env

---

## Чек-лист соответствия

### 1. Image: пул 6 моделей, приём model в body, один ключ KIE

| Проверка | Статус | Как проверить |
|----------|--------|----------------|
| В коде 6 моделей в пуле изображений | ✅ | `api/generate-image.ts`, `services/geminiService.ts`: flux-2/flex-image-to-image, google/nano-banana-edit, gpt-image/1.5-image-to-image, qwen/image-edit, grok-imagine/image-to-image, ideogram/v3-edit |
| Бэкенд читает `body.model` и подставляет в KIE | ✅ | `api/generate-image.ts`: `resolveImageModel(body.model)`, в body createTask уходит выбранная модель |
| Один ключ KIE (нет переключения основной/резервный) | ✅ | Используется только `KIE_API_KEY` |

**Ручная проверка:** В Lab выбрать другую модель в dropdown «Модель (image)», загрузить человек + образ, нажать Generate Image. В логах Vercel/сервера должен быть выбранный `model`; результат должен соответствовать выбранной модели.

---

### 2. Video: пул 6 моделей, veo-3-1 по умолчанию, расширенный промпт для Veo

| Проверка | Статус | Как проверить |
|----------|--------|----------------|
| В коде 6 моделей в пуле видео | ✅ | `api/generate-video.ts`, `services/geminiService.ts`: kling, veo-3-1, runway, hailuo, wan, grok-imagine/image-to-video |
| Дефолт видео — veo-3-1 | ✅ | `DEFAULT_VIDEO_MODEL = 'veo-3-1'`, `resolveVideoModel` при отсутствии body.model возвращает veo-3-1 |
| Расширенный промпт для Veo в запросе | ✅ | `api/generate-video.ts`: VEO_EXTENDED_PROMPT используется для veo/generate |

**Ручная проверка:** В Lab на шаге «Видео» выбрать другую модель в dropdown, указать источник картинки, нажать Generate Video. В логах должен быть выбранный `model`.

---

### 3. Lab UI: выбор модели из dropdown (image + video), без primary/backup

| Проверка | Статус | Как проверить |
|----------|--------|----------------|
| В Lab есть dropdown выбора модели для примерки | ✅ | `components/Lab.tsx`: `<select value={imageModel} onChange=...>` с IMAGE_MODEL_POOL |
| В Lab есть dropdown выбора модели для видео | ✅ | `<select value={videoModel} onChange=...>` с VIDEO_MODEL_POOL |
| Нет кнопок/переключателя «Основной / Резервный» в Lab | ✅ | В Lab только dropdown по имени модели, нет primary/backup UI |
| В настройках приложения нет переключателя Основной/Резервный | ✅ | В App.tsx нет такого переключателя; остался только устаревший комментарий (стр. 58) |

**Ручная проверка:** Настройки → ⚗️ Lab. Должны быть два выпадающих списка (модель для примерки, модель для видео) и кнопки «Generate Image» / «Generate Video». Не должно быть кнопок «KIE основной» / «KIE резервный».

---

### 4. Логирование: model, startTs, endTs, durationMs, httpStatus, creditsUsed, errorMessage

| Проверка | Статус | Как проверить |
|----------|--------|----------------|
| generate-image логирует model, startTs, endTs, durationMs, httpStatus | ✅ | `api/generate-image.ts`: request, createTask, success, job state=fail, timeout, error |
| generate-image логирует creditsUsed где доступно | ✅ | createTask лог: `creditsUsed` из createData?.data?.creditsUsed |
| generate-image при fail логирует errorMessage (failMsg) | ✅ | job state=fail: `errorMessage: failMsg` |
| generate-video логирует model, startTs, endTs, durationMs, httpStatus | ✅ | Аналогично по веткам veo, runway, jobs |
| generate-video логирует creditsUsed где доступно | ✅ | veo/generate и jobs/createTask: creditsUsed в логе |

**Ручная проверка:** Выполнить примерку и/или видео, открыть логи (Vercel Logs или консоль сервера). В записях должны быть поля: model, startTs, endTs, durationMs, httpStatus; при успешном createTask — creditsUsed; при ошибке — errorMessage.

---

### 5. Лаборатория только при import.meta.env.DEV (скрыта в production)

| Проверка | Статус | Примечание |
|----------|--------|------------|
| Кнопка «Lab» скрыта в production | ❌ | В `App.tsx` кнопка «⚗️ Lab» отображается всегда (стр. 504). Нет условия `import.meta.env.DEV`. По PR ожидалось: Lab только в dev. |
| Кнопка «Lab» видна в dev | ✅ | При запуске через `npm run dev` кнопка есть в Настройках |

**Рекомендация:** Если по продукту Lab должна быть только на dev — обернуть кнопку Lab в `{import.meta.env.DEV && ( ... кнопка Lab ... )}`. Если решение — показывать Lab и в production для тестов — зафиксировать это в PR/доках.

---

### 6. docs/LAB.md и vite-env.d.ts

| Проверка | Статус | Примечание |
|----------|--------|------------|
| Файл docs/LAB.md существует | ✅ | Содержимое устарело |
| LAB.md описывает текущее поведение Lab | ❌ | В LAB.md по-прежнему: «два провайдера: основной и резервный», «выбери KIE основной или KIE резервный». Сейчас в Lab — выбор **модели** из dropdown, один ключ KIE. Нужно обновить LAB.md под актуальный UI (пул моделей, один ключ, шаги Примерка/Видео с выбором модели). |
| vite-env.d.ts есть и подключён для Vite | ✅ | Файл `vite-env.d.ts` с `/// <reference types="vite/client" />` — типы Vite (в т.ч. import.meta.env) подхватываются. |

---

## Итог для тестировщика

- **Соответствует задаче PR:** пункты 1–4 (пулы моделей, приём model, один ключ, dropdown в Lab без primary/backup, логирование).
- **Не соответствует:** пункт 5 — Lab не скрыта в production (кнопка видна всегда). Пункт 6 — LAB.md не обновлён под новый сценарий (вместо основной/резервный — выбор модели из списка).

**Ручной сценарий проверки (кратко):**
1. Открыть приложение (dev или прод).
2. Настройки → ⚗️ Lab.
3. Шаг 1: загрузить человек + образ, выбрать модель из списка, «Generate Image» — убедиться, что запрос уходит с выбранной моделью и в логах она есть.
4. Шаг 2: выбрать источник картинки, выбрать модель видео, «Generate Video» — то же для видео.
5. Убедиться, что нигде нет переключателя «Основной / Резервный».
6. В production (если деплой доступен): проверить, видна ли кнопка Lab — по текущему коду она видна; если по ТЗ должна быть только в dev — завести баг/доработку.

После проверки можно закрыть задачу с пометкой: «Принято с замечаниями: скрыть Lab в production по желанию продукта; обновить docs/LAB.md под выбор моделей».
