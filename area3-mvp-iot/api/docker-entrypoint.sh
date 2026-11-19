#!/bin/sh
set -e
echo "[elo-api] aplicando migrações..."
pnpm db:migrate
echo "[elo-api] importando UFs e municípios do IBGE..."
pnpm db:ibge
if [ "${SEED_DEMO:-true}" = "true" ]; then
  echo "[elo-api] verificando seed de demonstração..."
  pnpm exec tsx db/seed-se-vazio.ts
fi
exec node dist/src/main.js
