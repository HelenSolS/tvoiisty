#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "[restart] Repo root: ${REPO_ROOT}"
echo "[restart] Restarting backend service only"

if [ -f "${REPO_ROOT}/docker-compose.yml" ] || [ -f "${REPO_ROOT}/docker-compose.yaml" ]; then
  echo "[restart] Using docker compose"
  # Restart all services defined in compose; safe and idempotent.
  docker compose restart
elif command -v pm2 >/dev/null 2>&1; then
  echo "[restart] Using pm2"
  # Reload all pm2 processes; assumes ecosystem is already configured.
  pm2 reload all || pm2 restart all
else
  echo "[restart] WARNING: No docker-compose.yml and no pm2 found."
  echo "[restart] Please restart backend manually."
fi

echo "[restart] Done."

