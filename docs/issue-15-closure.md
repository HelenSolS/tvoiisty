# Issue #15 — Provider Abstraction Layer. Статус и закрытие

## Имеет ли смысл ишью после отката?

**Да.** Откат касался только двух вещей:
1. **Деплой на Vercel** — модуль `lib/` не попадал в serverless-функцию → перенесли провайдер-логику в `api/_lib/` (ничего из контракта не меняли).
2. **Дефолт fallback** — вернули `fallbackOnError !== false` по умолчанию, чтобы при ошибке KIE по умолчанию вызывался Fal (как раньше).

Сама абстракция из #15 **не откатывалась** и работает.

---

## Что из ишью сделано (Acceptance Criteria)

| Критерий | Статус |
|----------|--------|
| Endpoint переключается корректно (fal/ → Fal, kie/ → KIE) | ✅ По полю `model`: `fal-ai/*` → Fal (queue.fal.run), иначе → KIE. Реализация: `api/_lib/provider-abstraction.ts`, `getImageProvider(model)`, роутер и провайдеры в `api/_lib/`. |
| Логика моделей не переписывается | ✅ Используются те же пулы моделей, один промпт для всех. |
| Unified interface: generateImage(payload), возврат model, duration_ms, status, credits_used | ✅ Контракт в `api/_lib/provider-abstraction.ts`, ответ API: `imageUrl`, `model`, `duration_ms`, `status`, `credits_used?`. |
| Centralized error mapping (timeout, 4xx, 5xx) | ✅ `mapToHttpError` в provider-abstraction; провайдеры возвращают единый формат ошибки с `httpStatus`. |
| Управление промптами в панели администратора | ✅ Режимы: стандартный (редактируемый текст), через ИИ (Fal/промпт с бэкенда), свой промпт. Отдельно для картинки и видео. `AdminPanel.tsx`, `adminSettings.ts`, `getEffectiveImagePrompt` / `getEffectiveVideoPrompt`. |

---

## Где в коде

- **Переключение по модели:** `api/_lib/provider-abstraction.ts` (`getImageProvider`), `api/_lib/generate-image-router.ts`, `api/_lib/providers/fal-image.ts`, `api/_lib/providers/kie-image.ts`.
- **API-хендлер:** `api/generate-image.ts` (импорт из `./_lib/provider-abstraction`, ответ с `model`, `duration_ms`, `status`, `credits_used?`).
- **Админка, промпты:** `components/AdminPanel.tsx`, `services/adminSettings.ts`, `types.ts` (AdminSettings, PromptMode).

---

## Рекомендуемый комментарий при закрытии ишью

Можно закрыть ишью с таким комментарием (скопировать в GitHub):

```
Реализовано и не откатывалось. Откат касался только деплоя (api/_lib для Vercel) и дефолта fallback.

Сделано:
- Переключение по model: fal-ai/* → Fal, иначе KIE (api/_lib/provider-abstraction, router, providers).
- Единый контракт: generateImage(payload), ответ: model, duration_ms, status, credits_used?, imageUrl.
- Централизованный маппинг ошибок (timeout → 408, 4xx/5xx).
- Админка: режимы промпта для картинки и видео (стандартный / через ИИ / свой текст).

Критерии приёмки выполнены. Логика моделей не переписывалась.
```

После этого ишью можно закрыть (Close issue).
