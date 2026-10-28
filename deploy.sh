#!/bin/bash

set -e

APP_DIR="/var/www/api-prod"
BACKUP_DIR="/var/www/backups/api-prod"
TIMESTAMP=$(date +%Y%m%d%H%M%S)

echo "🚀 PROD Deploy started..."

cd $APP_DIR

echo "📦 Creating backup..."
mkdir -p $BACKUP_DIR
cp -r dist $BACKUP_DIR/dist-$TIMESTAMP || true

rollback() {
  echo "❌ Deploy failed. Rolling back..."

  LAST_BACKUP=$(ls -dt $BACKUP_DIR/dist-* | head -n 1)

  if [ -z "$LAST_BACKUP" ]; then
    echo "⚠️ No backup found!"
    exit 1
  fi

  echo "🔁 Restoring backup: $LAST_BACKUP"

  rm -rf dist
  cp -r $LAST_BACKUP dist

  pm2 reload api-prod --update-env

  echo "✅ Rollback completed"
  exit 1
}

trap rollback ERR

echo "⬇️ Syncing latest code..."
git fetch origin
git reset --hard origin/main

echo "📥 Installing dependencies..."
npm install --no-audit --no-fund

echo "🗄 Running Prisma..."
npx prisma generate
npx prisma migrate deploy

echo "🏗 Building..."
npm run build

echo "♻️ Reloading PM2..."
pm2 reload api-prod --update-env

echo "✅ PROD Deploy successful"
