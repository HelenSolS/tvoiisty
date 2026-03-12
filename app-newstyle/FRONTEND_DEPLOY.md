# Фронтенд: ветки и деплой (Vercel)

## Ветки

- **`main`** — продакшен. Стабильная версия, с неё собирается основной домен.
- **`dev`** — разработка и превью. Все фичи и фиксы сначала попадают сюда, затем переносятся в `main` через merge.

## Однократное выравнивание веток

Чтобы привести `main` в соответствие с текущим `dev` (все коммиты из dev попадают в main):

```bash
git fetch origin
git checkout main
git pull origin main
git merge dev --no-edit
git push origin main
git checkout dev
```

Либо через Pull Request на GitHub: **base: main**, **compare: dev** → Merge → затем на сервере/локально `git pull origin main`.

## Настройка проекта в Vercel

1. **Repository:** `HelenSolS/newstyle`
2. **Root Directory:** оставить пустым (фронт в корне репозитория).
3. **Framework Preset:** Vite.
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Production Branch:** `main` — с неё собирается продакшен-домен.
7. **Preview deployments:** включены по умолчанию; для ветки `dev` будет свой URL вида `newstyle-git-dev-…vercel.app`.

Переменные окружения (если нужны):

- `VITE_API_BASE_URL` — URL бэкенда (например `https://api.tvoiistyle.top`).

## Маршруты фронта

- `/` — основной интерфейс (примерочная).
- `/demo/simple-tryon` — лёгкая демо-страница (фото + одежда → примерка → видео).

SPA: все пути отдаёт `index.html` (в проекте должен быть `vercel.json` с rewrite на `index.html`).

## План: выровнять ветки и настроить деплои (один раз)

1. **Локально запушь `dev`:**
   ```bash
   git push origin dev
   ```

2. **Проверь сборку фронта:**
   ```bash
   npm ci && npm run build
   ```
   Если ошибок нет — Vercel соберёт так же.

3. **В Vercel** в проекте newstyle:
   - **Settings → General → Production Branch** — выставить `main`.
   - **Settings → Build and Deployment** — Root Directory пусто, Build: `npm run build`, Output: `dist`.

4. **Выровнять `main` под `dev`** (один раз, чтобы в продакшене была актуальная версия):
   - На GitHub: **Pull request** из `dev` в `main` → просмотреть изменения → Merge.
   - Либо локально:
     ```bash
     git fetch origin
     git checkout main
     git pull origin main
     git merge dev --no-edit
     git push origin main
     git checkout dev
     ```

5. После push в `main` Vercel сам пересоберёт продакшен. Превью для `dev` будет по ссылке из вкладки Deployments (ветка dev).

## Чек-лист перед каждым новым деплоем

1. Убедиться, что сборка проходит локально: `npm ci && npm run build`.
2. Закоммитить и запушить изменения в `dev`: `git push origin dev`.
3. Проверить превью-деплой Vercel для ветки `dev`.
4. Когда всё ок — перенести в продакшен: merge `dev` → `main`, затем `git push origin main` (или merge PR в GitHub).
5. После push в `main` Vercel автоматически пересоберёт продакшен.
