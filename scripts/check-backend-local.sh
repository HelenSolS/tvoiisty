#!/usr/bin/env bash

set -euo pipefail

# Простой скрипт для проверки локального backend-а.
# Предполагается, что в другом терминале запущен:
#   npm run server

PORT="${PORT:-4000}"
URL="http://localhost:${PORT}/health"

echo "[check-backend-local] Checking ${URL}"

set +e
RESP="$(curl -sS -m 5 "${URL}")"
CODE=$?
set -e

if [ ${CODE} -ne 0 ]; then
  echo "[check-backend-local] ERROR: backend не отвечает на ${URL}"
  exit 1
fi

echo "[check-backend-local] OK, ответ:"
echo "${RESP}"

