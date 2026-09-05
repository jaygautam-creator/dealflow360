#!/usr/bin/env bash
# Access-control proof.
#
# Run this against a running dev server to demonstrate, live, that role scoping and portal
# tenancy are real rather than cosmetic. Every assertion below is a claim the application
# makes; this script checks each one against the actual HTTP responses.
#
#   npm run dev          # in one terminal
#   ./scripts/verify-access.sh
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
JAR=$(mktemp -d)
PASS=0
FAIL=0

green() { printf '\033[32m  PASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
red()   { printf '\033[31m  FAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
check() { if [ "$1" = "$2" ]; then green "$3"; else red "$3 (expected '$2', got '$1')"; fi; }

login() { # login <email> <jarname>
  curl -s -c "$JAR/$2.txt" -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"demo1234\"}"
}
page() { curl -s -b "$JAR/$1.txt" "$BASE$2"; }
status() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR/$1.txt" "$BASE$2"; }
seen() { if grep -q "$2" <<<"$1"; then echo yes; else echo no; fi; }

echo
echo "Authentication"
echo "--------------"
ok=$(login "rep@dealflow.test" rep | grep -c 'Priya Nair')
check "$ok" "1" "A valid credential signs in"

wrong=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"rep@dealflow.test","password":"wrong"}')
missing=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"nobody@nowhere.test","password":"demo1234"}')
check "$wrong" "$missing" "Wrong password and unknown user return an identical message (no user enumeration)"

anon=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/workspace")
check "$anon" "307" "An anonymous visitor is redirected away from the workspace"

echo
echo "Role scoping — a rep sees only their own quotations"
echo "---------------------------------------------------"
login "manager@dealflow.test" mgr > /dev/null
REP_VIEW=$(page rep /workspace)
MGR_VIEW=$(page mgr /workspace)

check "$(seen "$REP_VIEW" 'Beta Industries')" "yes" "Rep sees the customer they own"
check "$(seen "$REP_VIEW" 'Cygnus Ltd')"      "no"  "Rep CANNOT see another rep's customer"
check "$(seen "$REP_VIEW" 'Vikram Rao')"      "no"  "Rep CANNOT see another rep's deals"
check "$(seen "$MGR_VIEW" 'Beta Industries')" "yes" "Manager sees the first rep's deals"
check "$(seen "$MGR_VIEW" 'Cygnus Ltd')"      "yes" "Manager sees the second rep's deals"

echo
echo "Portal tenancy — a customer is confined to their own portal"
echo "-----------------------------------------------------------"
PORTAL_LOGIN=$(login "buyer@acme.test" portal)
check "$(seen "$PORTAL_LOGIN" '"redirectTo":"/portal"')" "yes" "Portal user is directed to the portal, never the workspace"
check "$(status portal /workspace)" "307" "Portal user is bounced out of the internal workspace"

echo
echo "-------------------------------------------"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
echo "-------------------------------------------"
echo
rm -rf "$JAR"
[ "$FAIL" -eq 0 ]
