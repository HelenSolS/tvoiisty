#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "[logs] Repo root: ${REPO_ROOT}"
echo "[logs] Showing backend logs"

if [ -f "${REPO_ROOT}/docker-compose.yml" ] || [ -f "${REPO_ROOT}/docker-compose.yaml" ]; then
  echo "[logs] Using docker compose logs (all services)"
  # Tail logs for all services; safe and does not modify containers.
  docker compose logs -f
elif command -v pm2 >/dev/null 2>&1; then
  echo "[logs] Using pm2 logs"
  pm2 logs
else
  echo "[logs] WARNING: No docker-compose.yml and no pm2 found."
  echo "[logs] Cannot automatically show backend logs; please use system logs manually."
fi

