#!/usr/bin/env bash
#
# Обновление сервера: подтянуть код с GitHub и перезапустить api + worker.
# Запускать на сервере из корня проекта: ./update-server.sh
#
set -e

SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f docker-compose.yml ]; then
  echo "Ошибка: docker-compose.yml не найден. Запускайте из корня проекта."
  exit 1
fi

BRANCH="${1:-dev}"
echo "=== Обновление сервера (ветка: $BRANCH) ==="

# Подтянуть код
if [ -d .git ]; then
  echo "Git pull origin $BRANCH..."
  git fetch origin
  git checkout "$BRANCH" 2>/dev/null || true
  git pull origin "$BRANCH"
else
  echo "Нет .git — пропускаем git pull."
fi

# Пересобрать и перезапустить только api и worker (postgres/redis не трогаем)
echo "Сборка api и worker..."
docker compose build api worker

echo "Перезапуск api и worker..."
docker compose up -d api worker

echo "Ожидание запуска (10 сек)..."
sleep 10

# Проверка
echo ""
docker compose ps
echo ""
echo "Health:"
curl -sf http://localhost:4000/health && echo " OK" || echo " (проверьте порт, например 4011)"
echo ""
echo "Готово."
