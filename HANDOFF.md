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
npm test              # 153 unit tests, ~0.5s
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

`src/domain` importing nothing is what makes 153 tests run in half a second with no database
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
| Unit tests | 153 |
| Live access assertions | 29 |
| Live lifecycle assertions | 33 |
| Production build | clean |

**Built:** six domain engines (blended risk scoring, approval routing, greedy set-cover
warehouse split, hybrid billing + proration, per-rep z-score anomaly detection, upsell
ranking) · full schema + seed · auth, RBAC matrix, request-pipeline path guards · quotation
/ approval / confirmation / portal / payment / health services · the whole admin config
area (9 screens) · pipeline board, quotations table, quotation builder with live risk
trace, approval queue, deal-health dashboard, orders / invoices / subscriptions lists ·
customer portal with negotiation · reports with filters and CSV/XLS export · manual
fulfilment override and backorder consolidation · subscription modify / cancel with
credit notes · signup, workspace top-bar actions, upsell dismiss, deal-health nudge ·
`docs/{ARCHITECTURE,REVIEWER_QA,DEMO_SCRIPT,ROADMAP}.md`.

**Verification scripts are the demo.** `scripts/verify-flow.sh` walks the problem
statement's own Section 9 test flow; it reseeds itself and holds a lock, so it is
deterministic from any starting state.

---

## Backlog — highest value first

Everything below is a genuine gap against the problem statement, not polish.

1. **Product variants in the quotation builder** — the schema (`ProductVariant`), the
   admin screen and the `POST /api/quotations/[id]/lines` route all support variants
   already; `QuotationBuilder.tsx` never offers the choice. The last real spec gap
   (A2 reaching B3).

Everything else that was on this list — reports with filters and export (A7), manual
warehouse override (B6), backorder consolidation (B6), and subscription modify / cancel
with credit notes (B7) — is now built and reachable from the UI.

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
