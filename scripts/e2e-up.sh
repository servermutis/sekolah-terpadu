#!/usr/bin/env bash
cd "$(dirname "$0")/.."
for f in /tmp/mock.pid /tmp/dev.pid; do [ -f $f ] && kill $(cat $f) 2>/dev/null; done; sleep 0.5
nohup node test/mock-supabase.js > /tmp/mock.log 2>&1 & echo $! > /tmp/mock.pid
SUPABASE_URL=http://localhost:54400 SUPABASE_ANON_KEY=sb_publishable_test_anon SUPABASE_SERVICE_ROLE_KEY=sb_secret_test_service \
SESSION_SECRET=0123456789abcdef0123456789abcdef0123 PORT=3100 nohup node scripts/dev-server.js > /tmp/dev.log 2>&1 & echo $! > /tmp/dev.pid
sleep 1.5; echo started
