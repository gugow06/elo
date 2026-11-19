#!/bin/sh
set -e
echo "[elo-api] aplicando migrações..."
pnpm db:migrate
if [ "${SEED_DEMO:-true}" = "true" ]; then
  echo "[elo-api] verificando seed de demonstração..."
  pnpm exec tsx db/seed-se-vazio.ts
fi
exec node dist/src/main.js
