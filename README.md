# DealFlow360

**A self-governing B2B sales operations platform.**
Odoo Hackathon 2026 — Grand Finale problem statement, 24-hour solo build.

Most sales tools handle the happy path: create a quote, confirm it, invoice it. Real B2B
sales is messier — multi-level discount approvals, stock spread across warehouses,
subscriptions mixed with one-time hardware on the same order, customers who want to
negotiate inside a portal instead of over email, and managers who only find out a deal
stalled after it already lost momentum.

DealFlow360 goes past quote-to-invoice and becomes a **deal engine that governs itself**:
it enforces pricing discipline, reacts to live inventory, keeps subscriptions and one-time
sales reconciled on one order, and gives the customer a living, negotiable document rather
than a static PDF.

---

## Running it

No Docker, no build step to configure, one process.

```bash
brew services start postgresql@16   # or however you run Postgres
createdb dealflow360

npm install
cp .env.example .env.local          # set YOUR_USER and AUTH_SECRET
npm run db:migrate                  # create the schema
npm run db:seed                     # load the demo dataset
npm run dev                         # http://localhost:3000
```

Everything runs on your own machine — local Postgres, local Next.js, no hosting account
and no network dependency. The database is yours to inspect:

```bash
psql -d dealflow360
```

```bash
npm test                       # 94 business-rule tests, ~1.2s
npx tsc --noEmit               # typecheck
```

### Demo logins

All accounts use the password `demo1234`.

| Email | Role | Sees |
|---|---|---|
| `admin@dealflow.test` | Admin | Everything, including governance configuration |
| `rep@dealflow.test` | Sales Rep | Own pipeline, quotation builder |
| `manager@dealflow.test` | Sales Manager | Approval queue, deal health |
| `finance@dealflow.test` | Finance | Second-level approvals, billing |
| `buyer@acme.test` | Customer Portal | **Only Acme Corp's own quotations** |

---

## The five decisions that carry the weight

Everything below is a pure function in `src/domain`, with tests. None of it is faked
for the demo — that is the point of isolating it.

### 1. Blended discount risk scoring

A single order-level discount limit does not work. A Gold customer may be entitled to 15%,
but a thin-margin Services line may only tolerate 10%. So every line is checked against
**the stricter of** its tier ceiling and its category ceiling, and the order is judged on
two independent signals:

- **Severity** — the worst single-line breach. Catches *one line is badly out of line*.
- **Aggregate** — the value-weighted mean breach. Catches *no line looks alarming, but the
  rep has quietly given away real margin across many of them*.

`score = max(severity, aggregate × amplifier)`

Taking the maximum rather than the sum keeps the score in one unit — percentage points
over ceiling — so an approval band like "escalate above 5" still means something to a
human. The amplifier is a database column, not a constant.

### 2. Approval routing that fails closed

Score bands live in the `ApprovalRule` table. Change a row in the admin screen and the very
next quotation routes differently, with no redeploy. If a score falls in a **gap** between
configured bands, it escalates to both approvers rather than slipping through — a
governance rule with a hole in it must fail closed, never open.

Every edit re-scores the quotation. If the new score needs a longer chain than the
completed approvals covered, the chain restarts. That closes the obvious exploit: submit
a clean quote, get it approved, then quietly raise the discount.

### 3. Multi-warehouse fulfilment as set cover

Minimising shipment count across warehouses is exactly the **set cover problem**, which is
NP-hard. Brute force is fine at demo scale and collapses for a business with 30 depots, so
this uses the standard **greedy approximation** — repeatedly take the warehouse covering
the most unmet demand, tie-breaking on shipping cost. Coverage is measured in order
**value**, not unit count, so the planner optimises for getting the expensive items out of
one place rather than a box of cheap screws.

A fast path runs first: if one warehouse can cover everything, take it. That is both the
optimal answer and the common case.

### 4. Hybrid billing on a single order

One-time lines collapse into a single invoice; each recurring line gets its own forward
billing calendar. An all-subscription order raises **no** one-time invoice at all — `null`,
not zero, because an invoice for nothing is a different thing from no invoice.

Every billing function takes the current date **as an argument** instead of reading the
clock. That makes proration deterministic, and means an invoice can be regenerated during
an audit and produce byte-identical numbers.

### 5. Anomaly detection against the rep's own history

A discount is flagged using a **z-score against that rep's own rolling average**, not a
company-wide threshold. A rep who habitually sells at 12% is not behaving oddly at 13%;
a rep who never exceeds 3% suddenly quoting 13% is. A fixed company number cannot tell
those two apart. Detection stays silent below a configured sample size rather than firing
on noise, and the zero-deviation case is handled explicitly instead of dividing by zero.

---

## Why it is built this way

```
src/app/             Interface     Next.js routes — pages and API handlers. Thin.
src/application/     Application   Services. Rules + persistence inside one transaction.
src/infrastructure/  Infra         Prisma client, sessions, RBAC.
src/domain/          Domain        Pure business rules. Zero dependencies.
src/components/      UI            Presentational component library.
```

**Dependencies point inwards only.** `src/domain` imports nothing — not `next`, not
Prisma, not React. No I/O, no clock, no randomness.

That constraint is doing real work. It is why 94 tests run in 1.2 seconds with no database
and no mocks, and it is the honest answer to *"did you actually implement these rules?"*
The rules are isolated enough to be tested directly, and they are.

Money never touches floating point. `DECIMAL(14,2)` in Postgres, integer paise in the
domain. `0.1 + 0.2 !== 0.3`, and this system computes invoices.

Full detail, with diagrams: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## Stack

| | | Chosen over |
|---|---|---|
| **Next.js 16** (App Router), React 19, TypeScript | UI and API in one process — no CORS, no second service | A separate SPA + Python backend: two deploys, two runtimes |
| **PostgreSQL** + Prisma 7 (`pg` driver adapter) | Relational data with real transactional invariants | MongoDB — this domain is joins and constraints, not documents |
| **Tailwind CSS v4** + a hand-built component library | No black-box UI dependency | A component framework whose internals I would have to defend |
| **Hand-built auth** (`jose` + `bcryptjs`) | RBAC and portal tenancy are graded parts of this problem | Clerk/Auth0 — outsources the thing being assessed |
| **Vitest**, domain layer only | Pure functions, so tests assert business rules directly | E2E tests that prove the UI rather than the logic |
| **No charting library** | One bar chart is 40 lines of SVG in a Server Component, shipping no JavaScript | recharts — a large dependency and an API to learn for one chart |
| **No date library** | Billing month-end is a business decision to state, not inherit | date-fns — see `src/domain/shared/dates.ts` |
| **No Docker** | `npm install && npm run dev`. Nothing to build or trust | A container adding a layer with no benefit here |
