# Reviewer Q&A — preparation notes

Odoo reviewers walk the floor repeatedly over 24 hours. The same project gets defended
three to five times, often to different people. Their stated focus is **algorithmic logic,
backend structuring and version control**, and their published rule is that *participants
must understand the code they submit*. So the goal is not a memorised script — it is
knowing the reasoning well enough to rebuild the answer live.

Answer structure that works: **one sentence of what, one sentence of why, then offer the
proof.** Never lecture. Let them ask the follow-up.

---

## 1. "What did you build?" — the 60-second answer

> DealFlow360 is a B2B sales operations platform. The ordinary version of this is
> quote → confirm → invoice. The interesting part is everything that goes wrong around
> that: discounts that need approving, stock spread across warehouses, subscriptions and
> hardware on the same order, and customers who want to negotiate.
>
> So I built it as a **deal engine that governs itself**. A rep never asks for approval —
> the system scores the quotation and routes it. Stock is never picked by hand — a planner
> allocates it across warehouses. And every rule that decides any of this lives in a
> database table, so it can be retuned without a deploy.

Then stop. Let them choose the thread.

---

## 2. "Why did you pick this problem statement?"

> Three were offered. Accounting was the safest and the most crowded — a trial balance
> that balances is table stakes, and most teams would build the same thing. HR/Payroll was
> mostly master-data plumbing, and I'm solo, so a four-person team would out-volume me on
> plumbing every time.
>
> This one was the only one whose weight sits in actual algorithms rather than CRUD. And
> the problem statement gives away the marking scheme: Section 9 is an eight-step test
> script, and Section 10 spends a full page explaining the blended risk score. That told
> me exactly where the marks were.

*Honest and specific. Reviewers respond to someone who read the brief properly.*

---

## 3. "Walk me through your architecture"

Point at the folders, then the constraint:

> Four layers. `domain` is pure business rules. `application` orchestrates them inside
> transactions. `infrastructure` is Prisma, sessions, hashing. `app` is Next.js routes.
>
> The one rule is that **dependencies point inwards only**. `src/domain` imports nothing —
> not Next, not Prisma, not React. No I/O, no clock, no randomness.

**Why that matters** — this is the answer that lands:

> Because it makes the rules testable in isolation. 183 tests, ~0.5 seconds, no database and
> no mocks. And it's the honest answer to "did you actually implement this, or fake it for
> the demo" — the rules are isolated enough to be tested directly, and they are.

If they ask *"isn't that over-engineering for 24 hours?"*:

> It saved me time rather than costing it. I could build and prove the scoring, the
> warehouse planner and the proration before the database even existed. When the UI
> arrived, the hard parts were already correct.

---

## 4. The five algorithms

For each: the simple sentence first, then the depth if they push.

### 4.1 Blended discount risk score

**Simple:**
> Every line is checked against its own discount limit — the stricter of what the
> customer's tier allows and what the product category allows. Then I ask two separate
> questions: is any one line badly out of line, and has the rep leaked margin across many
> lines? The score is whichever is worse.

**Deeper:**
> Signal A is the worst single-line breach. Signal B is the value-weighted mean breach.
> Score is `max(A, B × amplifier)`.
>
> Two things worth defending. **Max rather than sum** — because it keeps the score in one
> unit, percentage points over ceiling, so a band like "escalate above 5" still means
> something to a human. A sum would make the number meaningless. And **value-weighted** —
> eight points over on a line worth 2% of the order is not the same risk as eight points
> over on 60% of it.

**"Why the amplifier? Isn't 1.5 arbitrary?"**
> It is arbitrary, and that's exactly why it's a database column rather than a constant.
> It's a policy dial: how aggressively should spread-out discounting escalate relative to
> one bad line? That's a business judgement, not an engineering one. Change it in the admin
> screen and the next quotation routes differently.

**Worked example to have ready** (from the spec, and it's a test):
> Gold customer, 15% entitlement. Laptop at 12% — fine, hardware allows 15%. Setup service
> at 18% — but services only tolerate 10%, so that line is 8 points over. Whole quote gets
> flagged on that one line, even though 15% "sounded fine" for a Gold customer.

### 4.2 Approval routing

**Simple:**
> The score maps to a band, the band says who must approve. Bands are rows in a table.

**The two details worth volunteering:**
> It **fails closed**. If a score falls in a gap between configured bands, it escalates to
> both approvers rather than sliding through. A governance rule with a hole in it must fail
> closed, never open.
>
> And every edit re-scores. If the new score needs a longer chain than the approvals you
> already have, the chain restarts. That closes the obvious exploit — submit a clean quote,
> get it approved, then quietly raise the discount.

*That second point is the one that gets a nod. It shows adversarial thinking.*

### 4.3 Warehouse split

**Simple:**
> Ship from as few warehouses as possible. First I check whether one warehouse can cover
> everything — that's both optimal and the common case. If not, I greedily take the
> warehouse covering the most remaining order value, and repeat.

**Deeper — this is the strongest single answer in the project:**
> Minimising shipment count is the **set cover problem**, which is NP-hard. Brute force is
> `O(2^W)` — fine for two warehouses at a demo, useless for a business with thirty depots.
> So I used the standard **greedy approximation**, which is within a `ln(n)` factor of
> optimal and runs in `O(W × L)` per iteration.
>
> I measure coverage in **value, not unit count**, so it optimises for getting the expensive
> items out of one place rather than a box of cheap screws.

**"Why not just find the true optimum?"**
> At hackathon data sizes I could. I chose the algorithm that still works at real scale,
> and the greedy bound is well understood. If exactness mattered more than latency I'd run
> an ILP solver, but that's a different trade-off than a sales rep waiting on a screen.

### 4.4 Hybrid billing

**Simple:**
> One order can have hardware billed once and a subscription billed forever. The order
> stays whole and the *billing* splits — one invoice for the one-time lines, a separate
> forward schedule per recurring line.

**The detail that shows care:**
> An all-subscription order raises **no** one-time invoice — `null`, not zero. An invoice
> for nothing is a different thing from no invoice.
>
> And every billing function takes the current date **as an argument** rather than reading
> the clock. That makes proration deterministic and testable, and it means an old invoice
> can be regenerated during an audit and produce byte-identical numbers.

### 4.5 Discount anomaly detection

**Simple:**
> I flag a discount that's unusual **for that rep**, not unusual in general. It's a z-score
> against their own rolling history.

**Why:**
> A rep who habitually sells at 12% isn't behaving oddly at 13%. A rep who never exceeds 3%
> suddenly quoting 13% is. A single company-wide threshold cannot tell those apart — it
> either spams the first rep with alerts or misses the second entirely.

**Edge cases, volunteer them:**
> It stays silent below a minimum sample size, because three quotations isn't a
> distribution. And if a rep has given exactly the same discount every time, standard
> deviation is zero — I handle that explicitly instead of dividing by zero.

---

## 5. "How do I know it's not hardcoded?"

This is the question the spec practically promises they'll ask. Three answers, escalating:

1. **Run the tests.** `npm test` — 183 tests in about half a second. Open
   `src/domain/risk/blendedRisk.test.ts`; the worked example from their own problem
   statement is in there as a test case.
2. **Change a rule live.** Open the admin screen, change the aggregate amplifier or an
   approval band, re-open a quotation. It routes differently. No redeploy.
3. **Read the decision trace.** Every quotation stores the full breakdown — every line, its
   ceiling, which ceiling won, the breach, both signals, and which rule matched. It's
   rendered on the approval screen. A faked score has nothing to show.

---

## 6. Stack questions

**"Why Next.js and not a separate backend?"**
> One process serves the UI and the API. No CORS, no second service, no second deploy. Solo
> in 24 hours, every extra moving part is time I don't spend on the actual problem. The
> layering inside gives me the separation a split service would have given me, without the
> operational cost.

**"Why Postgres and not MongoDB?"**
> This data is relational — orders to lines to approvals to shipments to invoices — and
> confirming an order has to decrement stock, raise an invoice and open a billing schedule
> atomically. That's a transaction. Documents would push those invariants into application
> code where they'd eventually be violated.

**"Why no Docker?"**
> `npm install && npm run dev`. There's one Node process and a hosted database. A container
> would add a layer you'd have to trust for zero benefit here. If this needed a queue, a
> cache and a worker, my answer would be different.

**"Why did you build your own auth?"**
> RBAC and portal tenancy are explicitly part of what this problem is assessing. Handing
> that to Clerk would outsource the thing being graded.

**"Why Prisma?"**
> `schema.prisma` doubles as a readable one-file data model — you can review my entire
> schema in one screen. And migrations are version-controlled, so the schema history is in
> git alongside the code that depends on it.

---

## 7. Database questions

**"Why Decimal and not Float for money?"**
> `0.1 + 0.2 !== 0.3` in floating point, and this system computes invoices. Postgres columns
> are `DECIMAL(14,2)`; inside the domain everything is an integer count of paise, the same
> approach Stripe uses. Conversion happens at exactly one file, so there's one place where
> a rounding decision is made.

**"Why do you snapshot unitPrice on the quotation line?"**
> Because a price-list edit must not silently rewrite a quotation the customer has already
> seen. The line stores the price resolved at the moment it was added.

**"What's `triggeredByScore` on the approval step for?"**
> The quotation's live score changes as it's edited. Storing the score that actually
> triggered each step keeps the approval history truthful instead of retroactively rewritten.

**"Talk me through your indexes."**
> Foreign keys used in filters, plus `status` and `lastActivityAt` on quotations because the
> pipeline board and the stalled-deal detector both scan on those. I indexed for the queries
> I actually wrote rather than indexing everything.

---

## 8. Security and access questions

**"How does RBAC work?"**
> Permissions are a matrix in one file, not `if (role === ...)` scattered through routes.
> Adding a role is a data change, and the whole policy can be read on one screen. There are
> 15 tests asserting the policy directly.

**"How is the customer portal actually separate?"**
> A portal user is bound to exactly one customer, and that link is the tenancy boundary.
> Critically, `quotationScopeFor` returns a **filter, not a boolean** — a caller has to
> apply the constraint to get any rows at all, so scoping can't be silently forgotten. And
> a portal user with no customer link resolves to "none", not "unscoped".
>
> The portal role holds exactly one permission. It's not a cut-down internal role — that's
> how portal users end up seeing costs and margins.

**"Can a rep approve their own quotation?"**
> No. Separation of duties is enforced in the approval service regardless of role. An
> approval chain one person can satisfy alone is decoration.

**"What about the login form?"**
> Same error message for unknown user, wrong password and disabled account — otherwise the
> form becomes a user-enumeration oracle. And the bcrypt compare still runs on the miss
> path so response time doesn't leak whether the address exists.

---

## 9. Scale and production questions

**"What breaks at 10,000 quotations?"**
> Nothing structurally, but three things I'd change. Document numbering counts rows —
> that's a Postgres sequence in production; today the unique constraint would reject a
> concurrent collision rather than duplicate. The dashboard aggregates live, which I'd move
> to a materialised view. And the anomaly detector recomputes a rep's history per check,
> which I'd cache.

**"What about concurrent order confirmation?"**
> Stock decrements happen inside the confirmation transaction, so two simultaneous
> confirmations can't both claim the last unit. Under real contention I'd add `SELECT FOR
> UPDATE` on the stock rows to make the serialisation explicit rather than relying on the
> isolation level.

---

## 10. Known weaknesses — have these ready

Volunteering limitations reads as confidence, not weakness. Reviewers probe for
self-awareness, and "I don't know" said cleanly beats a bluff every time.

- **No rate limiting on login.** Would add it before anything real.
- **Document numbering is count-based**, not a sequence. Safe under the unique constraint,
  not elegant.
- **Dashboard aggregates are computed per request.** Fine at this size, wrong at scale.
- **Recurring invoices are generated at confirmation, not by a scheduler.** The forward
  schedule exists and is correct; the cron that acts on it is the next piece.
- **Domain layer is tested; the UI is not.** Deliberate — with 24 hours I put the tests
  where the risk was.

If asked something genuinely unknown: *"I don't know — here's how I'd find out."* Then say
how. That answer scores better than a guess every single time.

---

## 11. "What would you build next?"

> Three things, in order. A scheduler that acts on the billing schedules and actually
> raises recurring invoices — the calendar is there, the cron isn't. Then multi-currency,
> because the schema already carries currency but nothing converts. Then moving the
> dashboard aggregates to a materialised view, which is the first thing that breaks at
> scale.

---

## 12. If they ask about AI assistance

Answer plainly and move on:

> I used AI to accelerate implementation. Every architectural decision, the scoring design,
> the choice of greedy set cover, the layering — those are mine, and I can derive any of it
> on a whiteboard right now. Which part would you like me to walk through?

That reframes the question into an invitation to demonstrate understanding, which is what
they actually want to test. A denial that falls apart under a code walkthrough is far worse
than a straight answer.

---

## 13. Questions from the Odoo review

### 13.1 "Why did Finance clicking 'New Quotation' give a 404?"

`requirePermissionPage` in `src/infrastructure/auth/guards.ts:44` redirected unauthorised internal sessions to `/403`. Because the `/403` page route did not exist in the Next.js router, the framework rendered a generic 404 ("Not Found"). This made an access boundary look like a missing feature.

The boundary is now closed on both sides:
1. The page exists at `src/app/403/page.tsx:21` (`ForbiddenPage`), naming the boundary and the user's role rather than hiding behind a missing route.
2. The "New Quotation" button is hidden from roles without `QUOTATION_CREATE` using `can(user.role, P.QUOTATION_CREATE)` in both `src/app/(workspace)/workspace/page.tsx:38` and `src/app/(workspace)/workspace/quotations/page.tsx:27`. If a Finance user navigates directly to `/workspace/quotations/new`, line 11 invokes `await requirePermissionPage(P.QUOTATION_CREATE, "/workspace/quotations/new")` and redirects cleanly to `/403`.

### 13.2 "Could a customer request a 100% discount on the portal?"

It is capped at 30% in `src/domain/negotiation/counterOffer.ts:24` (`MAX_REQUESTABLE_DISCOUNT_PCT = 30`) and screened via `screenCounterOffer()` in `src/domain/negotiation/counterOffer.ts:36-59`.

Crucially, an over-cap ask is not dropped with a silent HTTP 400 error. In `src/application/portalService.ts:161-201`, the system records the counter-offer message with `status: "DECLINED"` (`portalService.ts:174`), writes an audit event with action `"COUNTER_OFFER_AUTO_DECLINED"` (`portalService.ts:182`), and explains the refusal to the customer. The quotation's status is deliberately left unchanged instead of moving to `UNDER_NEGOTIATION`, preventing frivolous submissions from landing on a sales representative's active board.

### 13.3 "How do month-end offers work without breaking discount governance?"

Month-end promotion evaluation lives in `src/domain/promotion/monthEnd.ts:112-179`.

Promotions are the classic backdoor through which discount limits get quietly bypassed. To prevent this, `evaluateMonthEndOffer` clamps the bonus against the product category's existing ceiling in `src/domain/promotion/monthEnd.ts:138-140`:
```ts
const headroom = Math.max(0, line.categoryMaxDiscountPct - line.currentDiscountPct);
const bonusPct = roundPct(Math.min(policy.bonusDiscountPct, headroom));
```
A promotion can never push a line past governance: a line already sitting at its category ceiling receives a 0% bonus and states why in the decision trace (`monthEnd.ts:150-155`). Any bonus that is granted increases the discount rate and feeds back into normal quotation re-scoring and approval routing.

### 13.4 "Can anyone edit a generated invoice?"

No. No route, server action, or admin screen in the codebase writes to an invoice's `amount`, `number`, or `salesOrderId`.

The only two invoice writes in the entire application are strict status transitions executed inside database transactions:
1. `src/application/paymentService.ts:48`: `await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } })` when incoming funds fully settle the balance.
2. `src/application/subscriptionService.ts:286`: `await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CREDITED" } })` when credit notes fully offset the invoice on cancellation.

A reviewer can verify this directly across the codebase with:
```bash
grep -rn "invoice\.update" src/
```

### 13.5 "Does the system scale beyond demo data?"

Yes. Run:
```bash
npm run db:seed:bulk
```
This executes `prisma/seed-bulk.ts`, populating the database with 405 quotations (45 quotations evenly spread across all 9 quotation statuses) and 40 customers across Bronze, Silver, and Gold tiers.

With 405 quotations loaded, the pipeline board (`/workspace`) renders in approximately 0.3s. Tenancy and role scoping remain completely solid under volume: `npm run verify:access` still passes all 29/29 assertions against the populated database.

### 13.6 "Could a sales rep fake a subscription start date to game commission?"

No. In `src/application/confirmationService.ts:310`, confirmation uses the server timestamp:
```ts
const confirmedAt = new Date();
```
The confirmation API handler at `src/app/api/quotations/[id]/confirm/route.ts:7-15` takes only the quotation ID from route parameters and accepts no request body. Because no request payload is parsed, there is no field through which a client or representative can supply a date. Subscription billing schedules and invoice dates derive strictly from `confirmedAt`.

### 13.7 "Are the business rules real or faked for the demo?"

They are completely real and strictly isolated:
1. `src/domain` contains zero dependencies on Prisma, Next.js, React, or external packages (verify with `grep -rn "from " src/domain/`). Every rule is a pure function.
2. Because the domain layer has no I/O, database, or clock dependencies, `npm test` executes the complete suite of 183 unit tests with zero mocks in approximately 0.45s.
3. For live verification, `scripts/verify-flow.sh` walks the problem statement's Section 9 end-to-end lifecycle flow against the live Next.js HTTP server (`http://localhost:3000`), testing real database transactions, multi-warehouse stock allocations, and approval chains.
