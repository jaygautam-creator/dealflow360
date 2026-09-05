# HANDOFF — live session state

**Purpose.** This file is the single source of truth for picking up work mid-build.
Update it whenever a phase completes. A fresh session should be able to read only this
file plus `docs/ARCHITECTURE.md` and continue without re-deriving anything.

**Last updated:** Admin (Sales Backend) screens complete — Section A of the problem
statement is done. Two sessions are building this concurrently on the same working tree;
see "Concurrent sessions" below before touching anything.

---

## Project

**DealFlow360** — a self-governing B2B sales operations platform.
Odoo Hackathon 2026 Grand Finale, 24-hour build, solo entrant.

Problem statement: DealFlow360 (Sales Ops). Chosen over Urban Furniture (Accounting) and
PeoplePay360 (HR/Payroll) because it is the only one of the three whose scoring weight
sits in genuine algorithms rather than master-data CRUD, and because its own PDF leaks
the rubric: Section 9 is an 8-step test script the reviewer will run, and Section 10
explains the blended risk score in full, which is the concept they will ask about.

## Stack, and the one-line reason for each

| Layer | Choice | Why this, not the alternative |
|---|---|---|
| Runtime | Next.js 16 (App Router), React 19, TypeScript | One process serves UI *and* API. No CORS, no two servers, no Docker, one `npm run dev`. |
| Database | PostgreSQL (Neon, via Vercel Marketplace) | The domain is deeply relational — orders to lines to approvals to shipments to invoices — and approval state plus stock allocation need real transactions. |
| ORM | Prisma 7 with the `@prisma/adapter-pg` driver adapter | `schema.prisma` doubles as the one-file data model a reviewer can read. Migrations are version-controlled. |
| Styling | Tailwind CSS v4 | Utility CSS, no runtime cost, no component black box. |
| Charts | Recharts | Declarative React charts for the deal-health dashboard. |
| Validation | Zod | Every API boundary parses input rather than trusting it. |
| Auth | Hand-built sessions (`jose` JWT + `bcryptjs`) | RBAC is a graded part of this problem. Handing it to Clerk would outsource the exact thing being assessed. |
| Tests | Vitest, domain layer only | The domain is pure, so tests are milliseconds and prove business rules directly. |

Deliberately **not** used: Docker (adds a layer the reviewer must trust for zero benefit
here), a separate backend service (two processes, two deploys, CORS), MongoDB (this data
is relational and needs transactions), an auth SaaS (see above).

## Architecture

Four layers, strictly one-directional — outer layers may import inner ones, never the reverse.

```
src/app/          interface     Next.js routes: pages + API handlers. Thin.
src/application/  application   Services. Orchestrate domain + repos inside transactions.
src/infrastructure/ infra       Prisma client, repositories, auth, session.
src/domain/       domain        PURE business rules. Zero imports from next/prisma/react.
```

The domain layer is the point of the whole design: it has no I/O, no clock and no
randomness, which is what makes 94 unit tests possible and what proves the business rules
are real rather than faked for the demo.

## Concurrent sessions

Two Claude Code sessions share this one working directory (not separate clones/worktrees).
Lane split, agreed live between the sessions:

- **odoo-2a owns:** `src/domain/**`, `src/application/**`, `src/infrastructure/**`,
  `src/app/api/**`, `src/app/(workspace)/**`, `src/app/(portal)/**`, `prisma/**`,
  `prisma.config.ts`, root config files.
- **This session owns:** `src/app/(admin)/**` — the Sales Backend / Configuration Area
  (Section A of the problem statement).
- Shared: `src/components/ui/**` and `src/components/layout/**` (presentational library —
  don't add new primitives there without checking; a third workstream owns it).

Since it's one filesystem, an uncommitted change on either side is visible to the other's
`npm run build`/`npm test` immediately — commit or stash before leaving something
half-done, and `git add <specific paths>` rather than `-A` so a commit doesn't sweep up
the other session's in-flight files. Pull before every commit; single `main` branch, no
feature branches.

## Status

### Done — Phase 1: domain engines (94 tests green at the time; 109 after Phase 3 added RBAC tests)

| Module | What it does |
|---|---|
| `src/domain/shared/money.ts` | Integer-paise money. No float arithmetic ever touches currency. |
| `src/domain/risk/blendedRisk.ts` | Blended discount risk score + full explainable decision trace. |
| `src/domain/risk/approvalRouting.ts` | Score to approval chain, from DB config. Fails closed. Re-approval on edit. |
| `src/domain/fulfillment/planner.ts` | Multi-warehouse split via greedy set cover + backorder consolidation. |
| `src/domain/billing/billing.ts` | One-time / recurring split, day-based proration, cancellation credits. |
| `src/domain/health/dealHealth.ts` | Stalled deals, per-rep z-score discount anomalies, delivery slippage. |
| `src/domain/upsell/recommend.ts` | Co-purchase ranking, promotion boost, margin-floor suppression. |

Also done: full `prisma/schema.prisma` (validated), `prisma.config.ts`, Vercel project
linked as `dealflow360`.

### Done — Phase 2: data layer

Neon Postgres provisioned and linked (`.env.local` has `DATABASE_URL` pooled +
`DATABASE_URL_UNPOOLED` direct — migrations and `prisma.config.ts` use the unpooled one;
runtime queries use the pooled one via `src/infrastructure/db.ts`). Initial migration
applied. `prisma/seed.ts` loads realistic demo data (tiered customers, categories with
distinct ceilings, split warehouse stock, a rep discount history shaped to trip the
anomaly detector, one deliberately stalled quotation). `docs/ARCHITECTURE.md` added.

### Done — Phase 3: auth + RBAC (odoo-2a)

Signed-JWT sessions in an httpOnly cookie, a declarative permission matrix
(`src/infrastructure/auth/rbac.ts`) separating "may read X" from "may read whose X",
login flow, and `src/app/api/_lib/respond.ts` for consistent error mapping
(`AuthError`→401/403, `ZodError`→400, `DomainError`→422). 109 tests green (94 domain + 15
RBAC). Admin route group guards are **not yet wired** — odoo-2a is centralizing that.

### Done — Section A: Sales Backend / admin config screens (this session)

Full CRUD under `src/app/(admin)/admin/**` for every table the domain engines read as
configuration: Products (+ variants), Categories, Price Lists (+ items), Tier Discount
Ceilings, Approval Rules, Risk Config (singleton form), Warehouses (+ stock levels),
Subscription Plans, Upsell Rules. One generic `EntityManager` client component (list +
modal form + delete) backs 7 of the 9; Products/PriceLists/Warehouses add a nested
`[id]` route for their child collection. `npm run build`, `npx tsc --noEmit`, and
`npm test` all green as of commit `ada2a8b`.

Gotcha worth remembering: `EntityManager` is a Client Component, but its config used to be
built in the Server Component page and handed down as props including a `render`
callback and a `toFormValues` function — React Server Components can't serialise
functions across that boundary, and it only surfaces at `npm run build` (prerender time),
not `npx tsc --noEmit`. Fixed by making column config a plain `kind` discriminant
(`"text" | "percent" | "badge"` with data-only tone/label maps) and deriving form
defaults from `row[field.name]` instead of a callback. **Run `npm run build`, not just
tsc, before every commit** — this class of bug is invisible otherwise.

### In progress (odoo-2a)

Application services layer (`src/application/quotationService.ts`,
`approvalService.ts`, `confirmationService.ts`, `lineService.ts`, `upsellService.ts`) and
`src/app/api/{quotations,lines}/**`. Next: portal negotiation service, then the
`(workspace)` internal UI (pipeline, quotation builder, approval screen).

### Next, in order (this session's lane)

Section A (admin) is complete. Nothing further is currently planned in
`src/app/(admin)/**` unless a gap turns up (e.g. wiring RBAC guards once odoo-2a exposes
the guard helper, or an ApprovalRule band-overlap/gap validator — a nice-to-have odoo-2a
flagged since the router fails closed on a gap, so it isn't a correctness bug, just a
demo polish item).

Remaining phases overall (owned by odoo-2a unless noted):

4. **Phase 4 — application services.** In progress, see above.
5. **Phase 5 — internal UI.** Pipeline, quotation builder with live margin + upsell panel,
   approval screen with the decision trace, fulfilment split screen, billing screen.
6. **Phase 6 — customer portal.** Separate restricted route group. Real tenancy, not a
   relabelled internal screen.
7. **Phase 7 — deal health dashboard.** Live aggregates, alerts, click-through.
8. **Phase 8 — polish.** Seed reset, demo rehearsal, architecture diagram review, README
   review, RBAC guard wired onto `(admin)`.

## Conventions

- **Git:** single `main` branch, no feature branches. Conventional-commit subjects; the
  body explains *why*, since that is what a reviewer reads.
- **Money:** integer paise inside the domain. Convert at the infrastructure boundary only.
- **Configuration over constants:** anything a business would tune (risk amplifier,
  approval bands, category ceilings, stall window, anomaly sensitivity) lives in a table.
- **Every state change writes an `AuditEvent`.** Append-only, never updated or deleted.
- **Traces, not just numbers.** Risk and fulfilment both return a machine-readable trace
  that the UI renders, so every automated decision can be explained on screen.

## Commands

```bash
npm run dev        # http://localhost:3000
npm test           # 109 tests (94 domain + 15 RBAC)
npm run build      # full production build — catches RSC boundary errors tsc misses
npm run db:migrate # apply schema
npm run db:seed    # demo data
npm run db:studio  # browse data
npx tsc --noEmit   # typecheck
```
