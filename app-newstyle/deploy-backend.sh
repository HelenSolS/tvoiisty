#!/usr/bin/env bash
# Универсальный деплой backend'а newstyle (dev/main) на сервер.
# Использование:
#   ./deploy-backend.sh           # деплой ветки dev
#   ./deploy-backend.sh main      # деплой ветки main

set -euo pipefail

# Ветка по умолчанию — dev. Можно передать main или любую другую.
BRANCH="${1:-dev}"

# Локальный репозиторий (на твоём Mac)
PROJECT_DIR="/Users/lena/newstyle"

# Сервер и каталог, где лежат бандлы/деплой
SERVER_HOST="root@46.17.96.72"
REMOTE_DIR="/opt/newstyle"

BUNDLE_NAME="newstyle-deploy.tar.gz"

echo "=== Backend deploy (branch: $BRANCH) ==="
echo "Локальный репозиторий: $PROJECT_DIR"
echo "Сервер: $SERVER_HOST:$REMOTE_DIR"
echo

echo "[local] Обновляем репозиторий и собираем бандл"
cd "$PROJECT_DIR"

echo "[local] git fetch origin"
git fetch origin

echo "[local] git checkout $BRANCH"
git checkout "$BRANCH"

echo "[local] git pull --ff-only origin $BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[local] ./make-deploy-bundle.sh"
./make-deploy-bundle.sh

echo
echo "[local] Отправляем $BUNDLE_NAME на сервер"
scp "$BUNDLE_NAME" "$SERVER_HOST:$REMOTE_DIR/"

echo
echo "[remote] Распаковка и запуск deploy.sh на сервере"
ssh "$SERVER_HOST" bash -lc "'
  set -e
  cd \"$REMOTE_DIR\"

  echo \"[remote] Распаковываем $BUNDLE_NAME\"
  rm -rf newstyle-deploy
  tar -xzf \"$BUNDLE_NAME\"

  cd newstyle-deploy
  chmod +x deploy.sh

  echo \"[remote] Запускаем ./deploy.sh\"
  ./deploy.sh
'"

echo
echo "=== Deploy $BRANCH завершён ==="

