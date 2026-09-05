#!/usr/bin/env bash
# Return the database to the exact state the demo starts from.
#
# WHY THIS EXISTS:
# "Reseed" is not one command. `npm run db:seed` rebuilds the seeded world, but it does
# not know about every table — MonthEndPromotion was added after it, so a promotion
# configured while rehearsing SURVIVES a reseed and silently changes what the month-end
# panel does during the real run. Bulk rows do get cleared by the reseed, but only if you
# remember to reseed at all.
#
# Relying on remembering two things in the wrong order, minutes before judging, is how a
# demo goes wrong. This is the one command that ends in a known state.
set -euo pipefail

PSQL="/opt/homebrew/opt/postgresql@16/bin/psql"
DB="${PGDATABASE:-dealflow360}"

echo
echo "Resetting to the demo starting state"

npm run db:seed >/dev/null 2>&1 || {
  echo "  Could not reseed. Is PostgreSQL running (brew services start postgresql@16)?"
  exit 1
}
echo "  seeded world rebuilt"

# Tables the seed script does not manage. Add to this list, not to prisma/seed.ts —
# verify-flow asserts exact values against the seed and must not be disturbed.
"$PSQL" -d "$DB" -qc 'DELETE FROM "MonthEndPromotion";'
echo "  month-end promotion overrides cleared"

QUOTES=$("$PSQL" -d "$DB" -tAc 'SELECT count(*) FROM "Quotation"' | tr -d ' ')
BULK=$("$PSQL" -d "$DB" -tAc $'SELECT count(*) FROM "Quotation" WHERE number LIKE \'[BULK]%\'' | tr -d ' ')
PROMOS=$("$PSQL" -d "$DB" -tAc 'SELECT count(*) FROM "MonthEndPromotion"' | tr -d ' ')

echo
echo "  quotations ............ $QUOTES"
echo "  of which bulk ......... $BULK"
echo "  promotion overrides ... $PROMOS"
echo

if [ "$BULK" != "0" ] || [ "$PROMOS" != "0" ]; then
  echo "  NOT clean — something above is non-zero."
  exit 1
fi
echo "  Clean. Ready to demo."
echo
