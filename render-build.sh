#!/usr/bin/env bash
set -euo pipefail

echo "==> Building frontend"
cd frontend
npm install
npm run build
cd ..

echo "==> Building backend"
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
cd ..

echo "==> Build complete"
