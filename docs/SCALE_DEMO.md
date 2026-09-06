# Scale Demo — DealFlow360

**Purpose:** Prove that the pipeline board, quotation table, and tenancy-scoping layer hold
correctly under a ~400-quotation load.  Run this walkthrough end-to-end before the judging
session starts so you know the timings, then repeat live.

> All numbers below are **real** — recorded from a single run of `npm run demo:scale` and the
> gate scripts against this codebase on 2026-09-06.

---

## Prerequisites

| Requirement | Check |
|---|---|
| PostgreSQL 16 running | `brew services list \| grep postgresql` |
| `npm run dev` running on :3000 | look for `✓ Ready` in the terminal |
| Seeded database | `npm run demo:reset` leaves it clean |

---

## Step 1 — Reset to the known starting state

```bash
npm run demo:reset
```

**What to say:**
> "I'm starting from the seeded demo world — 8 quotations across two reps, zero bulk rows,
> zero promotion overrides. The script verifies all three are actually zero before it exits,
> so there's no 'probably clean' ambiguity."

**Expected output (last lines):**
```
  quotations ............ 8
  of which bulk ......... 0
  promotion overrides ... 0

  Clean. Ready to demo.
```

---

## Step 2 — Load bulk data

```bash
npm run db:seed:bulk
```

**What to say:**
> "405 quotations across 40 customers, spread across every possible status. No Faker, no
> external dependencies — pure deterministic arithmetic so the run is reproducible. It uses
> integer paise arithmetic to avoid floating-point drift hitting the CHECK constraints."

**Real output:**
```
Bulk seed complete in 517ms.
  Customers created:       40
  Quotations created:      405
  Quotation lines created: 810
  Batches committed:       5
  Quotation statuses:      DRAFT (51), PENDING_MANAGER (51), PENDING_FINANCE (51),
                           APPROVED (51), REJECTED (51), SENT (50),
                           UNDER_NEGOTIATION (50), CANCELLED (50)
```

**Talking point:** 517 ms for 40 customers + 405 quotations + 648 lines — five `createMany`
batches inside explicit transactions, safe to re-run additively (sequences are scanned so
duplicates are impossible).

---

## Step 3 — Open the pipeline board: `/workspace`

Sign in as **manager@dealflow.test** / **demo1234** (the manager sees every rep's deals —
the widest possible view).

Navigate to `http://localhost:3000/workspace`.

**What to say:**
> "413 quotations total — 8 from the seed, 405 bulk. The Kanban board renders in 0.26 s and
> ships 263 KB. No pagination needed on the board itself because cards are grouped by status
> column; only the quotation table paginates."

**Real measurements:**

| Route | Bytes | Time |
|---|---|---|
| `/workspace` | 263,367 bytes | 0.263 s |
| `/workspace/quotations` | 197,160 bytes | 0.196 s |
| `/workspace/health` | 263,073 bytes | 0.229 s |

---

## Step 4 — Open the quotation table: `/workspace/quotations`

Navigate to `http://localhost:3000/workspace/quotations`.

**What to say:**
> "The table caps at 50 rows. The status bar reads 'Showing 50 of 413'. Use the search box —
> type '[BULK]' to filter to the generated rows, type 'Acme' to filter to a single customer.
> Sub-200 ms response at 413 rows because the underlying query uses indexed columns."

---

## Step 5 — Prove tenancy scoping holds at scale

```bash
npm run verify:access
```

**What to say:**
> "29 access-control assertions — authentication, role scoping, portal tenancy, navigation
> reachability, and privilege separation. Every single one passes with 413 quotations in the
> database. The scoping is not just a startup property; it holds at load because it is
> enforced in the query layer, not by counting rows afterward."

**Real output (last lines):**
```
-------------------------------------------
  29 passed, 0 failed
-------------------------------------------
```

---

## Step 6 — Reset back to the clean state

```bash
npm run demo:reset
```

**What to say:**
> "One command returns us to the 8-quotation starting state. This clears bulk rows via
> `db:seed`, then explicitly deletes `MonthEndPromotion` rows — the one table the seed
> script doesn't own — so there are no surprises if someone configured a promotion override
> during rehearsal."

---

## Supplementary gates (run in advance, paste results)

### `npx tsc --noEmit`
```
(no output — clean exit 0)
```

### `npm test`
```
 Test Files  12 passed (12)
      Tests  198 passed (198)
   Duration  486ms
```

### `npm run verify:flow`
```
  33 passed, 0 failed
```

---

## What this demonstrates

| Claim | Evidence |
|---|---|
| Bulk generator works after schema tightening | `db:seed:bulk` completes in 517 ms, no constraint violations |
| Pipeline board is responsive at scale | `/workspace` → 263 KB / 0.26 s with 413 quotations |
| Pagination is real, not cosmetic | Table shows "Showing 50 of 413" |
| Tenancy scoping holds at scale | `verify:access` 29/29 with bulk data loaded |
| System is fully typed and tested | `tsc --noEmit` clean, 198 tests passing |
