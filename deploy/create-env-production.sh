#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[create-env-production] ROOT_DIR=${ROOT_DIR}"

read -rp "
cd /opt/tvoiisty
bash deploy/create-env-production.sh
cd ~/tvoiisty
mkdir -p deploy
cat > deploy/create-env-production.sh <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[create-env-production] ROOT_DIR=${ROOT_DIR}"

read -rp "DATABASE_URL [default postgres://postgres:postgres@postgres:5432/app]: " DATABASE_URL
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@postgres:5432/app}"

read -rp "REDIS_URL [default redis://redis:6379]: " REDIS_URL
REDIS_URL="${REDIS_URL:-redis://redis:6379}"

read -rp "JWT_SECRET (обязательно, лучше длинная случайная строка): " JWT_SECRET
if [ -z "${JWT_SECRET}" ]; then
  echo "JWT_SECRET не может быть пустым."
  exit 1
fi

read -rp "KIE_API_KEY (обязательно): " KIE_API_KEY
if [ -z "${KIE_API_KEY}" ]; then
  echo "KIE_API_KEY не может быть пустым."
  exit 1
fi

echo
echo "Опциональные параметры хранилища (можно оставить пустыми):"
read -rp "BLOB_READ_WRITE_TOKEN (Vercel Blob) [optional]: " BLOB_READ_WRITE_TOKEN
read -rp "SUPABASE_URL [optional]: " SUPABASE_URL
read -rp "SUPABASE_SERVICE_KEY [optional]: " SUPABASE_SERVICE_KEY

echo
echo "Опциональные ключи моделей (fallback и т.п.):"
read -rp "FAL_KEY [optional]: " FAL_KEY

cat > .env.production <<EOF2
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}

JWT_SECRET=${JWT_SECRET}
KIE_API_KEY=${KIE_API_KEY}

BLOB_READ_WRITE_TOKEN=${BLOB_READ_WRITE_TOKEN}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}

FAL_KEY=${FAL_KEY}
EOF2

echo "[create-env-production] .env.production создан:"
echo
cat .env.production
echo
echo "[create-env-production] Готово."
