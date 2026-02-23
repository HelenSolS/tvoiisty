# Эталон: рабочие запросы и ответы (Fal + KIE)

**Цель:** сохранить «последний известный рабочий» вариант, когда и Fal, и KIE вызывались и возвращали ответ корректно. Использовать для быстрого фикса при поломке.

**Коммиты с рабочим состоянием:** `dev` после пуша с админ-панелью и fallback (например `09b1a69`, `f91415c`). История в `dev` — ориентир для отката.

---

## 1. Наш API: `POST /api/generate-image`

**Request (body):**
```json
{
  "personImageBase64": "<base64 или data URL или https://...>",
  "clothingImageBase64": "<base64 или data URL или https://...>",
  "prompt": "<опционально>",
  "model": "flux-2/flex-image-to-image | fal-ai/image-apps-v2/virtual-try-on | fal-ai/nano-banana-pro/edit | ...",
  "fallbackOnError": true
}
```

**Response 200 (успех):**
```json
{
  "imageUrl": "https://...",
  "model": "flux-2/flex-image-to-image",
  "duration_ms": 38000,
  "status": "success",
  "credits_used": 1
}
```
- Обязательно: `imageUrl` — непустая строка. Иначе не считать успехом.

**Response 4xx/5xx (ошибка):**
```json
{
  "error": "Текст для пользователя",
  "model": "...",
  "duration_ms": 1234
}
```

**Переключение провайдера:** по полю `model`: если начинается с `fal-ai/` → Fal, иначе → KIE.

---

## 2. Fal: вызов и ответы

**Базовый URL:** `https://queue.fal.run/{model}`  
**Заголовки:** `Authorization: Key ${FAL_KEY}`, `Content-Type: application/json`

### virtual-try-on (`fal-ai/image-apps-v2/virtual-try-on`)

**Request:**
```json
{
  "person_image_url": "https://...",
  "clothing_image_url": "https://...",
  "preserve_pose": true
}
```
Промпт API не принимает — в дашборде "No prompt".

**Ответ A — сразу картинка (200):**
```json
{
  "images": [{ "url": "https://..." }]
}
```
Берём `images[0].url`.

**Ответ B — очередь (200, body):**
```json
{
  "status": "IN_QUEUE",
  "request_id": "uuid",
  "status_url": "https://queue.fal.run/fal-ai/image-apps-v2/requests/{id}",
  "response_url": "https://queue.fal.run/fal-ai/image-apps-v2/requests/{id}"
}
```
- Не считать ошибкой. Опрашивать **именно `status_url` из ответа** (не собирать URL вручную).
- GET `status_url` с тем же `Authorization` до `status: "COMPLETED"` или `"FAILED"`.
- При `COMPLETED`: картинка может быть в теле ответа (`images[0].url`) или нужно GET по `response_url` и оттуда взять `images[0].url`.
- Таймаут ожидания: 35 с (FAL_POLL_TIMEOUT_MS).

### nano-banana-pro/edit (`fal-ai/nano-banana-pro/edit`)

**Request:**
```json
{
  "prompt": "Put the garment from the second image onto the person...",
  "image_urls": ["https://person...", "https://clothing..."],
  "num_images": 1,
  "aspect_ratio": "9:16",
  "output_format": "png",
  "resolution": "1K"
}
```

**Успех:** в ответе `images[0].url` или через очередь (как выше), тогда в результате опроса `status_url` / `response_url` — тот же формат `images[0].url`.

---

## 3. KIE: вызов и ответы

**Базовый URL:** `https://api.kie.ai/api/v1` (или KIE_BASE_URL)  
**Заголовки:** `Authorization: Bearer ${KIE_API_KEY}`, `Content-Type: application/json`

### Шаг 1: создать задачу  
`POST {KIE_BASE}/jobs/createTask`

**Request:**
```json
{
  "model": "flux-2/flex-image-to-image",
  "input": {
    "aspect_ratio": "9:16",
    "prompt": "Put the garment from the second image onto the person...",
    "resolution": "1K",
    "input_urls": ["https://person...", "https://clothing..."]
  }
}
```
Для `gpt-image/1.5-image-to-image` формат input другой (aspect_ratio, quality, input_urls, prompt).

**Response 200:**
```json
{
  "code": 200,
  "data": {
    "taskId": "...",
    "creditsUsed": 1
  }
}
```
Обязательно брать `data.taskId` для шага 2.

### Шаг 2: опрос результата  
`GET {KIE_BASE}/jobs/recordInfo?taskId={taskId}`  
Тот же `Authorization`.

**Повторять пока `data.state` не `success` или `fail`.**

**При state === "success":**
```json
{
  "data": {
    "state": "success",
    "resultJson": "{\"resultUrls\": [\"https://...\"]}"
  }
}
```
Картинка: `JSON.parse(data.resultJson).resultUrls[0]`.

**При state === "fail":** в `data.failMsg` — текст ошибки, отдать пользователю (422).

---

## 4. Быстрый фикс — что проверить

| Что сломалось | Куда смотреть |
|---------------|----------------|
| Fal возвращает 200, но мы считаем ошибкой | Не трактовать IN_QUEUE как ошибку; использовать `status_url` из ответа, не собирать URL вручную. Файл: `lib/providers/fal-image.ts`. |
| Fal: картинка есть, но мы не отдаём | Проверить извлечение `images[0].url` и из тела статуса, и из GET `response_url`. Тип FalQueuePayload. |
| KIE: нет картинки при success | Проверить разбор `resultJson` (строка JSON), поле `resultUrls[0]`. Файл: `lib/providers/kie-image.ts`. |
| Наш API отдаёт 200 без imageUrl | Не делать 200, если `result.imageUrl` пустой; проверка в `api/generate-image.ts`. |
| Fallback срабатывает после успеха KIE | Fallback только при `kieResult.status === 'error'` и только если `fallbackOnError === true`. Роутер: `lib/generate-image-router.ts`. |

При откате к «последнему рабочему» — смотреть историю ветки `dev` и эти контракты.
