#!/usr/bin/env bash
# Деплой backend'а ветки main на сервер.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

./deploy-backend.sh main

