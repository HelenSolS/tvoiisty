#!/usr/bin/env bash
# Собирает минимальный архив для сервера: только docker-compose, deploy.sh, backend (БЕЗ node_modules).
# На Mac: ./make-deploy-bundle.sh  → получишь newstyle-deploy.tar.gz (несколько МБ).
# На сервер копируешь только этот один файл, там: tar -xzf newstyle-deploy.tar.gz && cd newstyle-deploy && ./deploy.sh

set -e
SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"
BUNDLE_DIR="newstyle-deploy"
ARCHIVE="newstyle-deploy.tar.gz"

rm -rf "$BUNDLE_DIR" "$ARCHIVE"
mkdir -p "$BUNDLE_DIR"
cp docker-compose.yml deploy.sh "$BUNDLE_DIR/"
cp -r backend "$BUNDLE_DIR/"
rm -rf "$BUNDLE_DIR/backend/node_modules" "$BUNDLE_DIR/backend/dist" "$BUNDLE_DIR/backend/.git" 2>/dev/null || true
tar -czf "$ARCHIVE" "$BUNDLE_DIR"
rm -rf "$BUNDLE_DIR"
SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "Готово: $ARCHIVE ($SIZE)"
echo "На сервер: scp $ARCHIVE root@46.17.96.72:/root/"
echo "На сервере: cd /root && tar -xzf $ARCHIVE && cd $BUNDLE_DIR && chmod +x deploy.sh && ./deploy.sh"
