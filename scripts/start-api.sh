#!/bin/sh
set -eu

node scripts/init-signing-secret.js
cd apps/api
../../node_modules/.bin/prisma migrate deploy
if [ "${FLOWBOARD_DEMO_MODE:-false}" = "true" ]; then
  ../../node_modules/.bin/tsx prisma/seed.ts
fi
exec node dist/main.js
