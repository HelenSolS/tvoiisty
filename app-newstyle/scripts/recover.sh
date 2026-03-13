#!/usr/bin/env bash
#
# Аварийное восстановление: остановка зависших сервисов, очистка docker-proxy/сетей, перезапуск.
# Запуск: из корня проекта ./scripts/recover.sh  или  make recover
# Требует прав на systemctl (обычно root).
#
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"

cd "$PROJECT_DIR"

if [ ! -f docker-compose.yml ]; then
  echo "Ошибка: docker-compose.yml не найден. Запускайте из корня проекта."
  exit 1
fi

echo "=== Emergency recovery ==="
echo "Project dir: $PROJECT_DIR"

echo "Stopping containers"
docker compose down --remove-orphans || true

echo "Stopping docker services"
systemctl stop docker.socket 2>/dev/null || true
systemctl stop docker 2>/dev/null || true

echo "Killing docker-proxy"
pkill -9 docker-proxy 2>/dev/null || true

sleep 2

echo "Restarting docker"
systemctl start docker

sleep 3

echo "Cleaning networks"
docker network prune -f || true

echo "Starting containers"
docker compose up -d --build

echo "Waiting for backend (8s)"
sleep 8

curl -sf http://localhost:4000/health || {
  echo "Recovery failed"
  docker compose logs api --tail 100
  exit 1
}

echo "Server recovered"
