#!/usr/bin/env bash
# The scalability exhibit, in the only order that works.
#
# WHY THIS EXISTS:
# verify-flow reseeds as its FIRST action, so running it after loading bulk data silently
# wipes the thing you were about to demonstrate. Two sessions reported "all gates green"
# having done exactly that, and never tested the loaded state at all. The order is the
# whole point, so it lives in a script rather than in someone's memory.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"

if ! curl -s -o /dev/null --max-time 5 "$BASE/login"; then
  echo
  echo "  The server at $BASE is not responding. Start it with: npm run dev"
  exit 3
fi

echo
echo "1/3  Resetting to a known state first"
./scripts/demo-reset.sh >/dev/null
echo "     done"

echo
echo "2/3  Loading bulk data"
npm run db:seed:bulk 2>&1 | grep -E "complete|Quotation statuses" | sed 's/^/     /'

echo
echo "3/3  Proving the system still behaves under load"
# Signed in as the manager, who sees every rep's deals — the widest possible view, and so
# the honest one to measure. An unauthenticated request just gets the login redirect and
# would report a few kilobytes no matter how much data was loaded.
JAR=$(mktemp -d)
trap 'rm -rf "$JAR"' EXIT
curl -s -c "$JAR/m.txt" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"manager@dealflow.test","password":"demo1234"}' -o /dev/null

if ! grep -q . "$JAR/m.txt" 2>/dev/null; then
  echo "     Could not sign in as manager@dealflow.test — is the database seeded?"
  exit 1
fi

for path in /workspace /workspace/quotations /workspace/health; do
  printf "     %-24s %7s bytes  %ss\n" "$path" \
    "$(curl -s -b "$JAR/m.txt" "$BASE$path" | wc -c | tr -d ' ')" \
    "$(curl -s -b "$JAR/m.txt" -o /dev/null -w '%{time_total}' "$BASE$path")"
done

echo
echo "     Now run:  npm run verify:access     (access control still holds at scale)"
echo "     Then:     npm run demo:reset        (back to the demo starting state)"
echo
