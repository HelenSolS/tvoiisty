# Получение промпта из картинки через Fal (без прямого OpenAI)

**Цель:** вызывать «создание промпта по фото одежды» **не с прямым ключом OpenAI**, а через **Fal** — один ключ **FAL_KEY**, чтобы работало в т.ч. для РФ.

---

## Уже есть в проекте

- **Эндпоинт Fal:** `https://queue.fal.run/{model_id}`
- **Авторизация:** `Authorization: Key ${FAL_KEY}`
- **Тело запроса:** `POST`, `Content-Type: application/json`, `body: JSON.stringify({ input: { ... } })`
- Пример использования — `api/generate-image.ts` (virtual-tryon, FASHN, nano-banana-pro/edit).

То есть **эндпоинты и способ вызова Fal по FAL_KEY уже есть**; нужно только выбрать **модель и формат входа/выхода** для сценария «картинка → текст (промпт)».

---

## Что нужно в доках Fal

Нужен один из вариантов:

1. **Vision / image-to-text модель на Fal**  
   Модель, которая принимает изображение (URL или base64) и возвращает текст (или JSON).  
   Тогда в `prepare-tryon-prompt` вызываем `https://queue.fal.run/{vision_model}` с тем же **FAL_KEY**, в `input` передаём URL картинки одежды и системный промпт (из `lib/ai/prompts.ts` — Vision → JSON, затем при необходимости второй вызов для Prompt Builder).

2. **Chat/LLM с поддержкой картинки**  
   Модель в формате «сообщения + изображение» → ответ текстом.  
   Запрос к `https://queue.fal.run/{chat_model}` с `input: { messages: [...], image_url: ... }` (или аналог по докам). Тот же **FAL_KEY**.

3. **OpenAI-совместимый прокси на Fal**  
   Если в доках Fal описан прокси/шлюз в формате OpenAI API (например, `/v1/chat/completions`), который принимает **FAL_KEY** — можно вызывать его вместо прямого OpenAI. Тогда контракт «картинка + системный промпт → ответ» остаётся как в Issue #12, но ключ один — **FAL_KEY**.

---

## Где искать в доках

- **Каталог моделей:**  
  [fal.ai/models](https://fal.ai/models) — искать модели с тегами/описанием типа **vision**, **image understanding**, **LLaVA**, **multimodal**, **chat with image**.
- **Документация API:**  
  [fal.ai/docs](https://fal.ai/docs) — разделы про **REST API** и **queue.run** (или **run**): формат `input`/`output` для выбранной модели.
- **OpenAI-совместимый слой (если есть):**  
  В доках — раздел вроде «OpenAI compatibility» / «OpenAI API» / «Chat completions» и указание, что используется ключ Fal (FAL_KEY).

Итого: **эндпоинты у нас уже те же** (`queue.fal.run` + FAL_KEY). В доках нужно найти **конкретную модель** (vision или chat с картинкой) и **формат запроса/ответа** для «картинка → текст».

---

## Дальнейшие шаги

1. В [fal.ai/models](https://fal.ai/models) выбрать модель для «image → text» (или chat с image).
2. В [fal.ai/docs](https://fal.ai/docs) взять точный формат `input` (URL изображения, системный промпт, опционально user message) и формат ответа (текст или JSON).
3. В ветке с `api/prepare-tryon-prompt` заменить вызов OpenAI на вызов Fal по этому контракту, оставив те же системные промпты из `lib/ai/prompts.ts` и fallback на `DEFAULT_IMAGE_PROMPT`.

После этого промпт для примерки будет создаваться через Fal по **FAL_KEY**, без прямого ключа OpenAI.
