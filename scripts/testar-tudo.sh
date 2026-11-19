#!/usr/bin/env bash
# Roda todos os testes do ELO e salva as saídas como evidência (area4-devops/evidencias).
# Pré-requisito: docker compose up -d db (PostgreSQL em localhost:5432).
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=area4-devops/evidencias
mkdir -p "$OUT"
export DATABASE_URL="${DATABASE_URL:-postgresql://elo:elo_dev_local@localhost:5432/elo}"
data="$(date '+%Y-%m-%d %H:%M:%S')"
status=0

rodar() { # nome, comando...
  local nome=$1; shift
  echo "== $nome =="
  { echo "# $nome — executado em $data"; echo "\$ $*"; echo; "$@"; } > "$OUT/$nome.txt" 2>&1
  local rc=$?
  echo "   código de saída: $rc (saída em $OUT/$nome.txt)"
  [ $rc -ne 0 ] && status=1
}

rodar 01-build-node            pnpm -r build
rodar 02-testes-triagem        pnpm --filter @elo/triagem test
rodar 03-testes-api            pnpm --filter @elo/api test
rodar 04-avaliacao-triagem     pnpm --filter @elo/triagem avaliar validacao
PY="$(pwd)/area2-dados/.venv/bin/python"; [ -x "$PY" ] || PY="$(pwd)/area2-dados/.venv/Scripts/python"; [ -x "$PY" ] || PY=python
rodar 05-testes-pipeline       bash -c "cd area2-dados && '$PY' -m pytest -v"
rodar 06-pipeline-execucao     bash -c "cd area2-dados && '$PY' -m pipeline.gerador --forcar && '$PY' -m pipeline.etl"
if command -v flutter >/dev/null; then
  rodar 07-testes-app          bash -c "cd area3-mvp-iot/app && flutter test"
fi
echo
[ $status -eq 0 ] && echo "TODOS OS TESTES PASSARAM" || echo "HOUVE FALHAS: veja $OUT"
exit $status
