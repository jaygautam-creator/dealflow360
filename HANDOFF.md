# HANDOFF — live session state

**Purpose.** This file is the single source of truth for picking up work mid-build.
Update it whenever a phase completes. A fresh session should be able to read only this
file plus `docs/ARCHITECTURE.md` and continue without re-deriving anything.

**Last updated:** Phase 1 complete — domain engines done and tested.

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

## Status

### Done — Phase 1: domain engines (94 tests green, `npm test`)

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

### Blocked

- **Neon Postgres provisioning** needs a one-time human click to accept marketplace terms:
  `https://vercel.com/jay-gautams-projects-79c1ca46/~/integrations/accept-terms/neon?source=cli`
  Then re-run: `vercel integration add neon -n dealflow360-db --no-claim` and
  `vercel env pull .env.local --yes`.

### Next, in order

1. **Phase 2 — data layer.** `prisma migrate dev`, seed script with realistic demo data
   (Gold/Silver/Bronze customers, Hardware/Service/Subscription categories with different
   ceilings, 2 warehouses with deliberately split stock, approval bands, rep history for
   anomaly detection).
2. **Phase 3 — auth + RBAC.** Session cookie, role guard, portal tenancy scoping.
3. **Phase 4 — application services.** Quotation service (add/edit line, re-score, submit),
   approval service, confirmation service (order + fulfilment + billing in one transaction).
4. **Phase 5 — internal UI.** Pipeline, quotation builder with live margin + upsell panel,
   approval screen with the decision trace, fulfilment split screen, billing screen.
5. **Phase 6 — customer portal.** Separate restricted route group. Real tenancy, not a
   relabelled internal screen.
6. **Phase 7 — deal health dashboard.** Live aggregates, alerts, click-through.
7. **Phase 8 — polish.** Seed reset, demo rehearsal, architecture diagram, README.

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
npm test           # 94 domain tests
npm run db:migrate # apply schema
npm run db:seed    # demo data
npm run db:studio  # browse data
npx tsc --noEmit   # typecheck
```
