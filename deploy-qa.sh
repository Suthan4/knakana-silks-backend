#!/bin/bash

set -e

APP_DIR="/var/www/api-qa"

echo "🚀 QA Deploy started..."

cd $APP_DIR

echo "⬇️ Syncing latest code..."
git fetch origin
git reset --hard origin/dev

echo "📥 Installing dependencies..."
npm install --no-audit --no-fund

echo "🗄 Running Prisma..."
npx prisma generate
npx prisma migrate deploy

echo "🏗 Building..."
NODE_OPTIONS="--max-old-space-size=2560" npm run build

echo "♻️ Reloading PM2..."
pm2 reload api-qa --update-env

echo "✅ QA Deploy finished"
