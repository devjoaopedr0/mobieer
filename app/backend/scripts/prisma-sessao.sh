#!/usr/bin/env bash
# Roda o Prisma CLI pelo pooler do Supabase em modo sessão (porta 5432).
# Na porta 6543 do .env (modo transação) o `migrate` trava.
#   bash scripts/prisma-sessao.sh migrate status
#   bash scripts/prisma-sessao.sh migrate deploy
set -euo pipefail
cd "$(dirname "$0")/.."
url=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | sed -E 's#:6543/#:5432/#; s#[?&]pgbouncer=true##')
DATABASE_URL="$url" exec npx prisma "$@"
