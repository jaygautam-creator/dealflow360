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

# ── Mutual exclusion ────────────────────────────────────────────────────────
# These scripts reseed the database, which swaps every id underneath anything else
# running against it. Two people verifying at once therefore produce confusing,
# meaningless failures rather than useful ones. mkdir is atomic on every POSIX
# filesystem, which makes it a correct lock primitive without needing flock (absent
# on macOS by default).
LOCKDIR="${TMPDIR:-/tmp}/dealflow-verify.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo
  echo "  Another verification run is already in progress."
  echo "  (holder: $(cat "$LOCKDIR/owner" 2>/dev/null || echo unknown))"
  echo "  Wait for it to finish, or remove $LOCKDIR if it was left behind by a crash."
  echo
  exit 2
fi
echo "pid $$ started $(date '+%H:%M:%S')" > "$LOCKDIR/owner"
cleanup() { rm -rf "$LOCKDIR"; }
trap cleanup EXIT INT TERM

JAR=$(mktemp -d)
PASS=0; FAIL=0

b() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m    %s\033[0m\n' "$1"; }
ok()  { printf '\033[32m    PASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
no()  { printf '\033[31m    FAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (expected '$2', got '$1')"; fi; }
gt()   { if awk "BEGIN{exit !($1 > $2)}"; then ok "$3"; else no "$3 (got '$1', wanted > $2)"; fi; }
seen() { if grep -q "$2" <<<"$1"; then echo yes; else echo no; fi; }

login() { curl -s -c "$JAR/$2" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"demo1234\"}" > /dev/null; }
post() { curl -s -b "$JAR/$1" -X POST "$BASE$2" -H 'Content-Type: application/json' -d "${3:-{\}}"; }
get()  { curl -s -b "$JAR/$1" "$BASE$2"; }

echo
b "Resetting to a known state"
# The lifecycle assertions depend on exact seeded values — warehouse stock deep enough
# on one side and thin on the other so a mixed order MUST split, a rep with a specific
# discount history, particular tier and category ceilings. Any manual poking at the
# database beforehand changes those, and the script then reports a failure that is really
# just leftover state.
#
# So the script reseeds itself rather than trusting the caller to remember. It runs under
# the lock acquired above, so this cannot disturb a concurrent run — there are none.
if npm run db:seed >/dev/null 2>&1; then
  dim "database reseeded"
else
  echo "  Could not reseed the database. Is PostgreSQL running (brew services start postgresql@16)?"
  exit 1
fi

echo
b "Warming routes"
# The dev server compiles each route on its first request. A cold compile can take
# seconds, which makes the first assertion against a given route look like a failure
# when it is really a build. Every route the script touches is hit once here, before
# anything is asserted, so a timing artefact cannot be mistaken for a defect.
for route in /login /workspace /portal /admin; do
  curl -s -o /dev/null "$BASE$route" || true
done
dim "routes compiled"

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
b "12. Payment — an invoice is settled by what was received, not by assertion"
INV=$(npx --yes tsx scripts/_ids.ts "$QID" 2>/dev/null | tail -1)
INVID=$(jq -r .invoiceId <<<"$INV"); AMT=$(jq -r .invoiceAmount <<<"$INV")
dim "invoice total $AMT"

R=$(post rep "/api/invoices/$INVID/payments" "{\"amount\":100}")
check "$(jq -r .error <<<"$R" | grep -c 'Only finance')" "1" "A sales rep cannot record a payment"

HALF=$(awk "BEGIN{printf \"%.2f\", $AMT/2}")
R=$(post fin "/api/invoices/$INVID/payments" "{\"amount\":$HALF,\"method\":\"BANK\"}")
check "$(jq -r .status <<<"$R")" "OPEN" "A part payment leaves the invoice open"

R=$(post fin "/api/invoices/$INVID/payments" "{\"amount\":$AMT}")
check "$(jq -r .error <<<"$R" | grep -c 'overpay')" "1" "Overpayment is refused"

R=$(post fin "/api/invoices/$INVID/payments" "{\"amount\":$HALF}")
check "$(jq -r .status <<<"$R")" "PAID" "Paying the remainder settles the invoice"

R=$(post fin "/api/invoices/$INVID/payments" '{"amount":1}')
check "$(jq -r .error <<<"$R" | grep -c 'already settled')" "1" "A settled invoice takes no further payment"

echo
b "13. Customer portal — a clean quote goes out and comes back changed"
QID2=$(post rep /api/quotations "{\"customerId\":\"$ACME\"}" | jq -r .id)
R=$(post rep "/api/quotations/$QID2/lines" "{\"productId\":\"$LAPTOP\",\"quantity\":10,\"discountPct\":5}")
check "$(jq -r .recalc.riskScore <<<"$R")" "0" "A 5% discount on a Gold customer needs no approval"
R=$(post rep "/api/quotations/$QID2/submit")
check "$(jq -r .status <<<"$R")" "APPROVED" "Auto-approved without a human touching it"
R=$(post rep "/api/quotations/$QID2/send")
check "$(jq -r .status <<<"$R")" "SENT" "Published to the customer portal"

login buyer@acme.test buyer
PORTAL=$(get buyer /portal)
check "$(grep -c 'Awaiting your review' <<<"$PORTAL")" "1" "The customer sees it waiting for review"

echo
b "14. The portal must not leak internal figures"
PQ=$(get buyer "/portal/quotations/$QID2")
check "$(seen "$PQ" 'Discount risk')" "no" "Risk scoring is invisible to the customer"
check "$(seen "$PQ" 'drove the score')" "no" "The decision trace is invisible to the customer"
check "$(seen "$PQ" 'Margin')" "no" "Margin is never sent to the customer"
check "$(seen "$PQ" 'Audit trail')" "no" "The internal audit trail is invisible to the customer"

echo
b "15. Customer counters above the ceiling; the rep accepts"
R=$(post buyer "/api/portal/quotations/$QID2/messages" \
  '{"body":"We need a better price to proceed this quarter.","requestedDiscountPct":20}')
check "$(jq -r .status <<<"$R")" "UNDER_NEGOTIATION" "The counter-offer moves the deal into negotiation"

MSG=$(npx --yes tsx scripts/_ids.ts "$QID2" 2>/dev/null | tail -1 | jq -r .messageId)
R=$(post rep "/api/negotiations/$MSG" '{"action":"ACCEPT"}')
dim "$(jq -r .reason <<<"$R")"
check "$(jq -r .riskScore <<<"$R")" "7.5" "20% against a 15% ceiling re-scores to 7.5 points over"
check "$(jq -r .reapprovalRequired <<<"$R")" "true" "Accepting the counter forces the quote back into approval"

echo
b "16. The re-opened quotation cannot be confirmed until it is approved again"
R=$(post rep "/api/quotations/$QID2/confirm")
check "$(jq -r .error <<<"$R" | grep -c 'cannot be confirmed')" "1" "Confirmation is blocked on the re-opened quotation"

echo
echo "-------------------------------------------"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
echo "-------------------------------------------"
echo
rm -rf "$JAR"
[ "$FAIL" -eq 0 ]
