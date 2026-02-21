# 09. GitHub процесс: ветки, PR, CI

## 9.1. Ветки
- `main` — только прод, только протестированное.
- `dev` — активная интеграция фич.
- `test` — стабилизация перед релизом.

Рекомендуемый поток:
1) От `dev` создаётся feature-ветка: `feat/<issue-id>-short-name`.
2) PR → `dev`.
3) После набора фич: PR `dev` → `test`.
4) После стабилизации: PR `test` → `main`.

## 9.2. Pull Request правила
Каждый PR обязан:
- ссылаться на Issue
- иметь чеклист (линт, тесты, миграции)
- содержать скриншоты UI (если фронт)
- иметь автотесты (или отдельный Issue на тесты, но до merge в main)

## 9.3. CI (GitHub Actions)
На каждый PR в `dev/test/main` запускается:
- lint
- typecheck
- unit tests
- integration tests
- build

На merge в `main`:
- build + deploy production

## 9.4. Issue менеджмент
### Labels
- type: feature|bug|chore
- area: frontend|backend|worker|infra|qa|design
- priority: p0|p1|p2
- stage: mvp|stage2|stage3

### Issue шаблон
В каждом Issue обязательно:
- Контекст (зачем)
- Скоуп (что входит/не входит)
- Acceptance Criteria (проверяемые пункты)
- Edge cases
- Дизайн/макеты (если есть)
- Тест-кейсы

## 9.5. Релизы
- Релиз — это merge в `main` с тегом `v0.x.y`.
- Release notes составляются из закрытых issues.

