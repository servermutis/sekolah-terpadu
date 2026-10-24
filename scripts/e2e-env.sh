#!/usr/bin/env bash
# Siapkan DB uji (migrasi + seed e2e) lalu jalankan mock Supabase + dev server.
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -h /tmp/pgtest -p 54329 -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists t" -c "create database t" >/dev/null 2>&1
P="$P -d t"
for f in supabase/tests/00_stub_supabase.sql supabase/migrations/*.sql test/seed-e2e.sql; do $P -f "$f" >/dev/null; done
echo "DB siap"
