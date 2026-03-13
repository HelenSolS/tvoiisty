#!/bin/bash
# Полный сброс и запуск backend на сервере. Запускать из /opt/newstyle/newstyle
set -e
cd "$(dirname "$0")/.."
echo "=== 1. Останавливаем ВСЕ контейнеры newstyle ==="
docker compose down --remove-orphans 2>/dev/null || true
echo "=== 2. Останавливаем ВСЕ контейнеры на хосте (освобождаем порты) ==="
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm -f $(docker ps -aq) 2>/dev/null || true
echo "=== 3. Ждём 3 сек ==="
sleep 3
echo "=== 4. Запуск только newstyle ==="
docker compose up -d --build
echo "=== 5. Ждём 30 сек (postgres healthcheck, миграции) ==="
sleep 30
echo "=== 6. Статус ==="
docker compose ps
echo "=== 7. Health ==="
curl -s http://localhost:4001/health || echo "FAIL"
echo ""
echo "=== 8. Логи api (последние 15 строк) ==="
docker compose logs api --tail 15
