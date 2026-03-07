#!/usr/bin/env bash
# Запускать на сервере (SSH). Обновляет код и пересобирает backend.
# Использование: ssh root@46.17.96.72 "cd /opt/tvoiisty && bash scripts/deploy-on-server.sh"

set -e
cd "$(dirname "$0")/.."

echo "==> git pull origin dev"
git fetch origin dev
git merge origin/dev --no-edit || true

echo "==> docker compose up -d --build"
docker compose up -d --build

echo "==> проверка хранилища для загрузки фото"
curl -s http://localhost:3000/api/media/upload/check || true
echo ""

echo "Готово. Если загрузка фото всё ещё даёт 502:"
echo "1. Добавь в конфиг Nginx для api.tvoiistyle.top таймауты (см. scripts/nginx-api-upload.conf.example)."
echo "2. sudo nginx -t && sudo systemctl reload nginx"
