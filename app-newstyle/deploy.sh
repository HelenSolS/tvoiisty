#!/usr/bin/env bash
# Поднимает весь стек: postgres, redis, api, worker.
# Запускать только как файл из корня проекта: ./deploy.sh (не вставлять в терминал!)

set -e

# Переход в каталог, где лежит этот скрипт (корень проекта)
SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f docker-compose.yml ]; then
  echo "Ошибка: docker-compose.yml не найден. Запускайте скрипт из корня проекта: ./deploy.sh"
  exit 1
fi

echo "Project dir: $SCRIPT_DIR"
echo "Starting Docker stack (postgres, redis, api, worker)..."
docker compose up -d

echo "Waiting for services to be ready..."
sleep 5

docker compose ps
echo ""
echo "Health check:"
curl -s http://localhost:4000/health || true
echo ""
echo "Done. API: http://localhost:4000"
