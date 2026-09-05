#!/usr/bin/env bash
# End-to-end verification of the quotation lifecycle.
#
# This walks the "Quick Test Flow" from the problem statement against the real running
# application — no mocks, no fixtures, no shortcuts through the domain layer. Each step
# prints what the system decided and why, so it doubles as a demo rehearsal.
#
#   npm run dev              # in one terminal
#   npm run db:seed          # reset to a known state
#   ./scripts/verify-flow.sh
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
JAR=$(mktemp -d)
PASS=0; FAIL=0

b() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m    %s\033[0m\n' "$1"; }
ok()  { printf '\033[32m    PASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
no()  { printf '\033[31m    FAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (expected '$2', got '$1')"; fi; }
gt()   { if awk "BEGIN{exit !($1 > $2)}"; then ok "$3"; else no "$3 (got '$1', wanted > $2)"; fi; }

login() { curl -s -c "$JAR/$2" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"demo1234\"}" > /dev/null; }
post() { curl -s -b "$JAR/$1" -X POST "$BASE$2" -H 'Content-Type: application/json' -d "${3:-{\}}"; }
get()  { curl -s -b "$JAR/$1" "$BASE$2"; }

echo
b "Resolving seed data"
IDS=$(npx --yes tsx scripts/_ids.ts 2>/dev/null | tail -1)
ACME=$(jq -r .acme <<<"$IDS"); LAPTOP=$(jq -r .laptop <<<"$IDS")
SETUP=$(jq -r .setup <<<"$IDS"); SERVER=$(jq -r .server <<<"$IDS"); SUPPORT=$(jq -r .support <<<"$IDS")
dim "Acme Corp (GOLD, 15% tier ceiling) and four products"

echo
b "1. Sales rep signs in and opens a new quotation"
login rep@dealflow.test rep
QID=$(post rep /api/quotations "{\"customerId\":\"$ACME\"}" | jq -r .id)
[ -n "$QID" ] && [ "$QID" != "null" ] && ok "Quotation created" || no "Quotation creation failed"

echo
b "2. A compliant line: 10 laptops at 12% (Hardware tolerates 15%)"
R=$(post rep "/api/quotations/$QID/lines" "{\"productId\":\"$LAPTOP\",\"quantity\":10,\"discountPct\":12}")
SCORE=$(jq -r .recalc.riskScore <<<"$R")
dim "risk score: $SCORE"
check "$SCORE" "0" "A discount inside every ceiling scores zero"

echo
b "3. A breaching line: setup service at 18% (Service tolerates only 10%)"
R=$(post rep "/api/quotations/$QID/lines" "{\"productId\":\"$SETUP\",\"quantity\":2,\"discountPct\":18}")
SCORE=$(jq -r .recalc.riskScore <<<"$R")
dim "risk score: $SCORE"
dim "$(jq -r .recalc.explanation <<<"$R")"
check "$SCORE" "8" "The stricter category ceiling wins: 18% - 10% = 8 points over"

echo
b "4. Add servers (forces a warehouse split) and a subscription (forces hybrid billing)"
post rep "/api/quotations/$QID/lines" "{\"productId\":\"$SERVER\",\"quantity\":5,\"discountPct\":0}" > /dev/null
R=$(post rep "/api/quotations/$QID/lines" "{\"productId\":\"$SUPPORT\",\"quantity\":10,\"discountPct\":0}")
dim "order margin: $(jq -r .recalc.marginPct <<<"$R")%"
gt "$(jq -r .recalc.marginPct <<<"$R")" "0" "Live margin is computed from real cost data"

echo
b "5. Live upsell suggestions, ranked and margin-filtered"
S=$(get rep "/api/quotations/$QID/lines")
jq -r '.suggestions[] | "    \(.productName) — rank \(.rankScore), margin delta \(.marginDeltaPct)pp\(if .isPromoted then " [promoted]" else "" end)"' <<<"$S"
gt "$(jq '.suggestions | length' <<<"$S")" "0" "Suggestions are produced from co-purchase rules"

echo
b "6. Submit — the system routes it, the rep never asks"
R=$(post rep "/api/quotations/$QID/submit")
dim "$(jq -r .routingExplanation <<<"$R")"
check "$(jq -r .status <<<"$R")" "PENDING_MANAGER" "Auto-routed into the approval chain"
check "$(jq '.requiredSteps | length' <<<"$R")" "2" "Score above 5 requires manager AND finance"

echo
b "7. Separation of duties — the owning rep cannot approve their own quotation"
R=$(post rep "/api/quotations/$QID/decision" '{"action":"APPROVE"}')
check "$(jq -r .error <<<"$R" | grep -c 'cannot act on approvals')" "1" "A rep is refused at the approval route"

echo
b "8. Manager approves, then finance"
login manager@dealflow.test mgr
R=$(post mgr "/api/quotations/$QID/decision" '{"action":"APPROVE","reason":"Strategic account"}')
dim "$(jq -r .message <<<"$R")"
check "$(jq -r .remainingSteps <<<"$R")" "1" "Manager approval leaves the finance step outstanding"

b "   Finance may not be skipped — confirming now must fail"
R=$(post rep "/api/quotations/$QID/confirm")
check "$(jq -r .error <<<"$R" | grep -c 'cannot be confirmed')" "1" "Confirmation is blocked while an approval step is outstanding"

login finance@dealflow.test fin
R=$(post fin "/api/quotations/$QID/decision" '{"action":"APPROVE","reason":"Margin acceptable"}')
dim "$(jq -r .message <<<"$R")"
check "$(jq -r .quotationStatus <<<"$R")" "APPROVED" "Final approval clears the quotation"

echo
b "9. Finance approves discounts but does not confirm orders"
R=$(post fin "/api/quotations/$QID/confirm")
check "$(jq -r .error <<<"$R" | grep -c 'may not perform')" "1" "Finance is refused the confirm action by RBAC"

echo
b "10. Confirm — order, warehouse split, stock reservation and billing, in one transaction"
R=$(post rep "/api/quotations/$QID/confirm")
dim "order: $(jq -r .orderNumber <<<"$R")"
dim "shipments: $(jq -r .shipmentCount <<<"$R")  backorder: $(jq -r .hasBackorder <<<"$R")"
dim "one-time invoice: $(jq -r .oneTimeInvoiceNumber <<<"$R")"
dim "recurring schedules: $(jq -r .recurringScheduleCount <<<"$R")"
jq -r '.planTrace[]? | "    \(.reason)"' <<<"$R"
check "$(jq -r .shipmentCount <<<"$R")" "2" "Stock is split across two warehouses (neither can cover alone)"
check "$(jq -r .recurringScheduleCount <<<"$R")" "1" "The subscription line opens its own billing schedule"
[ "$(jq -r .oneTimeInvoiceNumber <<<"$R")" != "null" ] \
  && ok "One-time lines are invoiced separately from the subscription" \
  || no "Expected a one-time invoice"

echo
b "11. A confirmed quotation is immutable"
R=$(post rep "/api/quotations/$QID/confirm")
check "$(jq -r .error <<<"$R" | grep -c 'already been confirmed')" "1" "Double confirmation is refused"

echo
echo "-------------------------------------------"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
echo "-------------------------------------------"
echo
rm -rf "$JAR"
[ "$FAIL" -eq 0 ]
