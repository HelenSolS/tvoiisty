# Provider Abstraction Layer (Fal / KIE Switch)

## 🔒 DEV-ONLY WORKFLOW
Работать строго в dev.

---

## 🎯 Цель
Отделить prompt от провайдера.

---

## 🛠 Реализация
Добавить SELECTED_MODEL.
Если fal/ → Fal endpoint
Если kie/ → KIE endpoint

Prompt остаётся один.

---

## ✅ Acceptance Criteria
- Endpoint переключается корректно
- Логика моделей не переписывается