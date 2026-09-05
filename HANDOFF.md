# HANDOFF — current state

Read this plus `docs/ARCHITECTURE.md` and you have everything. Update the Status and
Backlog sections as work completes.

**Project:** DealFlow360 — a self-governing B2B sales operations platform.
Odoo Hackathon 2026 grand finale, 24-hour build, solo entrant (Jay).
**Repo:** https://github.com/jaygautam-creator/dealflow360 — public, single `main` branch.

---

## Runs entirely locally. No hosting, no deploy.

Guidance from the Odoo mentor was explicit: keep it local, keep external libraries few,
and be able to defend every one that stays. A reviewer must be able to run their own SQL
against the data.

```bash
brew services start postgresql@16     # once per boot
createdb dealflow360                  # first time only
cp .env.example .env.local            # then set YOUR_USER and AUTH_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev                           # http://localhost:3000
```

```bash
npm test              # 185 unit tests, ~0.5s
npm run verify        # 62 live assertions against the running server
npx tsc --noEmit      # typecheck
npm run build         # NEVER while `npm run dev` is running — it rewrites .next underneath it
psql -d dealflow360   # a reviewer can query anything directly
```

All logins use password `demo1234`:
`admin@` · `rep@` · `manager@` · `finance@` (all `@dealflow.test`) · `buyer@acme.test` (portal).

---

## Stack, and the one-line defence of each

| Layer | Choice | Why, and over what |
|---|---|---|
| Runtime | Next.js 16 App Router, React 19, TypeScript | UI and API in one process. No CORS, no second service, no Docker. Over a separate SPA + Python backend: two deploys, two runtimes, more moving parts for a solo build. |
| Database | Local PostgreSQL 16 | Relational data with real transactional invariants. Over MongoDB: this domain is joins and constraints, not documents. |
| ORM | Prisma 7 + `@prisma/adapter-pg` | `schema.prisma` doubles as a one-file readable data model; migrations are version-controlled. |
| Styling | Tailwind v4 + a hand-built component library | No black-box UI dependency to defend. |
| Auth | Hand-built (`jose` + `bcryptjs`) | RBAC and portal tenancy are graded parts of this problem; Clerk would outsource the thing being assessed. |
| Validation | Zod at every API boundary | The brief calls out input validation explicitly. |
| Tests | Vitest, domain + RBAC only | Those layers are pure, so tests assert business rules directly in milliseconds. |

**Deliberately removed:** `recharts` (one bar chart is 40 lines of SVG in a Server
Component, shipping no JS) and `date-fns` (billing date maths is core; month-end
behaviour is a business decision to state, not inherit — see `src/domain/shared/dates.ts`).
**Deliberately absent:** Docker, any hosting provider, any auth SaaS.

---

## Architecture

Four layers. **Dependencies point inwards only.**

```
src/app/             Interface     Next routes: pages + API handlers. Thin.
src/application/     Application   Services. Rules + persistence inside one transaction.
src/infrastructure/  Infra         Prisma client, sessions, RBAC, money boundary.
src/domain/          Domain        PURE rules. Imports nothing. No I/O, no clock, no randomness.
src/components/      UI            Presentational component library.
src/proxy.ts         Pipeline      Path-to-permission enforcement before a route renders.
```

`src/domain` importing nothing is what makes 185 tests run in half a second with no database
and no mocks — and it is the honest answer to "did you really implement these rules?"

**Non-negotiable conventions:**
- Money never touches floating point. `DECIMAL(14,2)` in Postgres, integer **paise** in the
  domain. Cross the boundary only via `src/infrastructure/money.ts`.
- Anything a business would tune lives in a **table**, not a constant: risk amplifier,
  approval bands, tier and category ceilings, stall window, anomaly sensitivity.
- Every state change writes an **append-only** `AuditEvent`.
- Risk and fulfilment return a **decision trace** the UI renders. A number without its
  reasoning is an assertion.
- Tenancy is a **filter, not a boolean** (`quotationScopeFor`), so scoping cannot be
  forgotten at a call site.

---

## Status — all green

| Gate | Result |
|---|---|
| Unit tests | 185 |
| Live access assertions | 29 |
| Live lifecycle assertions | 33 |
| Production build | clean |

**Built:** six domain engines (blended risk scoring, approval routing, greedy set-cover
warehouse split, hybrid billing + proration, per-rep z-score anomaly detection, upsell
ranking) · counter-offer cap · month-end promotion engine, tunable from /admin/month-end-offers by an administrator or a sales manager · /403 page · bulk data generator ·
admin audit trail on all config screens · full schema + seed · auth, RBAC matrix,
request-pipeline path guards · quotation / approval / confirmation / portal / payment / health services ·
the whole admin config area (10 screens) · pipeline board, quotations table, quotation builder
with live risk trace, approval queue, deal-health dashboard, orders / invoices / subscriptions lists ·
customer portal with negotiation · reports with filters and CSV/XLS export · manual
fulfilment override and backorder consolidation · subscription modify / cancel with
credit notes · signup, workspace top-bar actions, upsell dismiss, deal-health nudge ·
`docs/{ARCHITECTURE,REVIEWER_QA,DEMO_SCRIPT,ROADMAP}.md`.

**Verification scripts are the demo.** `scripts/verify-flow.sh` walks the problem
statement's own Section 9 test flow; it reseeds itself and holds a lock, so it is
deterministic from any starting state.

### Demo sequencing

- `npm run verify:flow` reseeds the database as its first action and wipes bulk data.
- `npm run demo:scale` — the scalability exhibit, in the only order that works. It resets
  first, loads the bulk data, then measures the pages signed in as the manager.
- `npm run demo:reset` — back to the demo starting state. Use this rather than
  `db:seed` alone: the seed script does not manage every table, so a month-end promotion
  configured while rehearsing survives a plain reseed and silently changes what the panel
  does. `demo:reset` clears it and prints proof that the database is clean.
- Both verify scripts refuse to run against a dead server now, with one clear line instead
  of a cascade of assertion failures that look like a real regression.
- `npm run verify:access` does **not** reseed, so it can run safely against either seed state without clearing bulk records.

---

## Backlog

The backlog is empty. There are no remaining open items against the problem statement or technical specification.

All items previously on this list — product variants in the quotation builder, reports with filters and export, manual warehouse override, backorder consolidation, and subscription modify / cancel with credit notes — are implemented, wired into the UI, and verified by tests.

---

## Known Limitations

Two entries that stood here — `Customer.email` not being `@unique`, and `PROMOTION_BOOST`
being a constant — are now closed. They had been deferred on the grounds that a unique
constraint against a populated table can fail mid-apply on duplicate data. That was worth
checking rather than assuming: the database held zero duplicate customer emails and zero
duplicate approval sequences, before and after a 40-customer bulk load, so the constraint
was applied. `promotionBoost` now lives in `RiskConfig` alongside every other tunable and
is editable at `/admin/risk-config`.

What remains, each deliberate:

- **Accepting a counter-offer returns the quotation to `DRAFT`** rather than auto-routing
  it to the next approval stage. This is a decision, not a gap: it strips approvals that no
  longer cover the deal and hands it back to the rep with the new score and the reason
  shown. Silently escalating to Finance without the rep seeing it is governance you cannot
  see. The quote cannot be confirmed until re-approved — `verify-flow` section 16 asserts
  exactly that.
- **Five seeded `CONFIRMED` quotations have no `SalesOrder`.** They come from
  `prisma/seed.ts` and represent deal history, not deals this system executed. Only
  quotations confirmed through the running application carry the full order, invoice,
  fulfilment and billing chain, because that chain is created in one transaction in
  `confirmationService.ts`. The bulk generator deliberately produces no `CONFIRMED` rows
  for the same reason — fabricating them would misrepresent work that never happened.
- **The UI is light-only by design** (`data-theme="light"` in the root layout, reasoning in
  `globals.css`). The component library carries `dark:` variants throughout, so enabling it
  is a one-line change, but that has not been visually reviewed.

---

## Working with a second session in parallel

Two sessions share this working tree and database. Lane discipline matters.

- **`git add <explicit paths>`, never `git add -A`** — the other session's in-flight files
  will be swept in.
- Agree a lane before starting. Past split: one session owned `src/app/(admin)/**` and
  `src/app/(workspace)/workspace/orders/**`; the other owned domain, application,
  infrastructure, auth, and the rest of `(workspace)`/`(portal)`.
- `npm run verify` reseeds and holds a lock, so it is safe to run any time; smoke-test
  destructively and let it reset the world.
- Never `npm run build` while a dev server is running.
