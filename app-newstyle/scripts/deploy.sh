#!/usr/bin/env bash
#
# Стандартный деплой: обновление репозитория и перезапуск контейнеров.
# Запуск: из корня проекта ./scripts/deploy.sh  или  make deploy
#
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
BRANCH="${1:-dev}"

cd "$PROJECT_DIR"

if [ ! -f docker-compose.yml ]; then
  echo "Ошибка: docker-compose.yml не найден. Запускайте из корня проекта."
  exit 1
fi

echo "=== Deploy (branch: $BRANCH) ==="
echo "Project dir: $PROJECT_DIR"

echo "Updating repository"
git fetch origin
git checkout "$BRANCH" 2>/dev/null || true
git pull --ff-only origin "$BRANCH"

echo "Building containers"
docker compose up -d --build

echo "Waiting for backend (8s)"
sleep 8

curl -sf http://localhost:4000/health || {
  echo "Health check failed"
  docker compose logs api --tail 100
  exit 1
}

echo "Deploy successful"
