#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[install-newstyle] ROOT_DIR=${ROOT_DIR}"

echo "[STEP 1] Ensure .env.production exists"
if [ ! -f ".env.production" ]; then
  cat > .env.production <<'EOF'
DATABASE_URL=postgres://postgres:postgres@postgres:5432/app
REDIS_URL=redis://redis:6379
EOF
  echo "[install-newstyle] Created default .env.production"
else
  echo "[install-newstyle] .env.production already exists, leaving as is"
fi

echo "[STEP 2] Build backend image via docker compose"
docker compose -f docker-compose.production.yml build

echo "[STEP 3] Start containers"
docker compose -f docker-compose.production.yml up -d

echo "[STEP 4] Wait for backend to start"
sleep 5

echo "[STEP 5] Check backend health"
set +e
HEALTH_OUTPUT="$(curl -sS -m 5 http://localhost:3000/api/health)"
CODE=$?
set -e

echo "[install-newstyle] Health response (code=${CODE}): ${HEALTH_OUTPUT}"

if [ "${CODE}" -ne 0 ] || [[ "${HEALTH_OUTPUT}" != *'"status":"ok"'* ]]; then
  echo "[install-newstyle] WARNING: backend health check did not return {\"status\":\"ok\"}"
fi

echo "[STEP 6] docker ps"
docker ps

echo "[install-newstyle] Done."

