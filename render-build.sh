#!/usr/bin/env bash
set -euo pipefail

echo "==> Building frontend"
cd frontend
# --include=dev is required because NODE_ENV=production (set for the runtime
# service) makes plain `npm install` skip devDependencies, which is where
# typescript/vite/@types live — without them the tsc build step fails.
npm install --include=dev
npm run build
cd ..

echo "==> Building backend"
cd backend
npm install --include=dev
npx prisma generate
npx prisma migrate deploy
npm run build
cd ..

echo "==> Build complete"
