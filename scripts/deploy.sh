#!/usr/bin/env bash

set -euo pipefail

# Always run from repo root (scripts/ is alongside backend/, app-newstyle/, etc.)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "[deploy] Repo root: ${REPO_ROOT}"

echo "[deploy] 1) git pull"
git pull --ff-only

echo "[deploy] 2) Installing frontend deps (if app-newstyle exists)"
if [ -f "${REPO_ROOT}/app-newstyle/package.json" ]; then
  cd "${REPO_ROOT}/app-newstyle"
  npm install

  echo "[deploy] 3) Building frontend (app-newstyle)"
  npm run build
else
  echo "[deploy] Skipped app-newstyle: package.json not found."
fi

cd "${REPO_ROOT}"

echo "[deploy] 4) Restarting backend service"

# Prefer docker compose if present
if [ -f "${REPO_ROOT}/docker-compose.yml" ] || [ -f "${REPO_ROOT}/docker-compose.yaml" ]; then
  # Do not recreate everything, just refresh images and restart in place.
  echo "[deploy] Detected docker-compose, running docker compose up -d"
  docker compose up -d
elif command -v pm2 >/dev/null 2>&1; then
  # Generic pm2 reload; assumes process name or ecosystem is already configured.
  echo "[deploy] Detected pm2, reloading all pm2 processes"
  pm2 reload all || pm2 restart all
else
  echo "[deploy] WARNING: No docker-compose.yml and no pm2 found."
  echo "[deploy] Please restart backend manually (systemd/service) if needed."
fi

echo "[deploy] Done."

