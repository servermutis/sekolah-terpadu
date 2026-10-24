#!/usr/bin/env bash
# Uji skema + RLS pada Postgres lokal (stub Supabase). Pakai: scripts/test-db.sh [host-socket] [port]
set -euo pipefail
cd "$(dirname "$0")/.."
H=${1:-/tmp/pgtest}; PORT=${2:-54329}
P="psql -h $H -p $PORT -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists t" -c "create database t" >/dev/null 2>&1
P="$P -d t"
for f in supabase/tests/00_stub_supabase.sql supabase/migrations/*.sql supabase/tests/10_rls_and_points.sql; do $P -f "$f" 2>&1 | grep -v '^$' || true; done
