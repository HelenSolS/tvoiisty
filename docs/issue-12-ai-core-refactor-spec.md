# Issue #12 — AI Core Refactor: спецификация реализации

Ссылка: [GitHub Issue #12](https://github.com/HelenSolS/tvoiisty/issues/12)

---

## ⚠️ Scope clarification — do NOT expand architecture

This issue must be implemented **strictly within the existing structure**.

**Important constraints:**

1. ❗ **Do NOT** introduce a new AI architecture layer.
2. ❗ **Do NOT** refactor existing providers (KIE / Fal / Gemini).
3. ❗ **Do NOT** modify generate-image logic.
4. ❗ **Do NOT** create abstraction layers or service hierarchies.
5. ❗ **Do NOT** move logic into global shared AI frameworks.

**The goal is minimal and isolated:**

- Add **ONE** new endpoint: **POST /api/prepare-tryon-prompt**
- Use **existing project structure**
- Use **OpenAI via Fal** inside this endpoint (FAL_KEY only; no direct OPENAI_API_KEY)
- Retry Vision **once**
- If failure → **fallback to DEFAULT_IMAGE_PROMPT**
- Return **`{ prompt, garmentJson? }`**

**Nothing else.**

This is a **functional enhancement**, not a system refactor. The current pipeline must remain fully operational and unchanged.

**Process:** Work strictly in **dev**. Prepare **PR**. Wait for **review** before pushing.

---

Ответы на вопросы по реализации — без двойных трактовок.

---

## 1. OpenAI через Fal (не прямой ключ)

**Да, подтверждаем:** для анализа и сборки prompt используем **OpenAI-совместимый вызов через Fal** — не прямой OpenAI API.

- Логика: Vision (анализ одежды) + Prompt Builder (финальный prompt) — как раньше.
- **Ключ один:** **`FAL_KEY`** (тот же, что для примерки). Прямой `OPENAI_API_KEY` в примерочной **не используем**.
- Вызов идёт в Fal (например, OpenAI-совместимый прокси или vision/chat-модель Fal), авторизация: `Authorization: Key ${FAL_KEY}`.

**Gemini для этого слоя не используем.**

Важно: «OpenAI» в контексте примерки = вызов через Fal. Генерация изображений и видео остаётся через KIE / Fal.

---

## 2. Где живёт новый пайплайн

**Одна ручка**, не две.

**POST** `/api/prepare-tryon-prompt`

**Body:**
```json
{
  "personImageBase64": "string",
  "garmentImageBase64": "string"
}
```

**Внутри:**
1. Vision (`garmentImageBase64`) → JSON
2. Prompt Builder (JSON + инструкции) → `finalPrompt`

**Response:**
```json
{
  "prompt": "string",
  "garmentJson": {} 
}
```
`garmentJson` — опционально, только для отладки.

Фронт получает один готовый prompt. Две ручки не делать — усложнит фронт.

---

## 3. Подключение на фронте

Вместо текущего:
```ts
describeOutfit(outfitBase64)
```

Делаем:
```ts
prepareTryonPrompt(personBase64, garmentBase64)
```

Фронт получает один готовый prompt и вызывает:
```ts
generateTryOn(personBase64, garmentBase64, prompt, selectedModel)
```

Всё остальное (модели, история, выбор KIE/Fal) — не трогаем.

---

## 4. Устойчивость JSON

Требование к **надёжности**.

Обязательно:
- Валидировать JSON через **Zod** (или аналог)
- Если JSON невалидный → **1 retry** Vision
- Если повторно невалидный → **fallback на DEFAULT_IMAGE_PROMPT**
- Если Prompt Builder падает → **fallback на DEFAULT_IMAGE_PROMPT**

Текущий рабочий pipeline не ломать.

**Robustness & guardrails:**
- **Vision timeout:** 15s.
- **Retry Vision once** if JSON invalid (parse or schema).
- If second attempt fails → use safe default prompt (`DEFAULT_IMAGE_PROMPT`).
- **Validate JSON schema** (Zod) before calling Prompt Builder.
- **Log malformed JSON** (e.g. `[prepare-tryon-prompt] malformed Vision JSON`) for debugging.

---

## 5. Язык финального prompt

Финальный prompt — **только английский**. Никаких русских формулировок. Все системные инструкции для Prompt Builder — на английском.

---

## Дополнительные правила

- **Vision не анализирует лицо.** Vision анализирует только одежду.
- **Prompt Builder обязан вставлять Identity Lock блок.**
- Prompt Builder **не меняет** камеру, ракурс и фигуру.
- Prompt должен быть **коротким, структурированным и инженерным**, не художественным.

---

## Итоговая архитектура

```
Frontend
   ↓
POST /api/prepare-tryon-prompt  (personBase64, garmentBase64)
   ↓
Vision через Fal (FAL_KEY) → JSON (garment_type, color, material, fit, sleeves, length, style, details)
   ↓
Prompt Builder через Fal (FAL_KEY) → finalPrompt
   ↓
Frontend получает { prompt }
   ↓
generateTryOn(personBase64, garmentBase64, prompt, model) через KIE (primary) → Fal (fallback)
```

---

## Константы

`DEFAULT_IMAGE_PROMPT` для fallback — брать из `api/generate-image.ts` (текущий дефолт для KIE).
