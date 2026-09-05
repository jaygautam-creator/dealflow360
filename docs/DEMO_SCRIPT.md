# Demo script — five minutes, two full flows

The deliverable asks for a five-minute live demo covering at least two end-to-end flows.
This is that walk, timed, with the sentence to say at each step.

**Before starting:** `npm run db:seed` for a clean state, `npm run dev`, and have two browser
windows open — one signed in as the rep, one as the customer. Switching accounts live
wastes thirty seconds you do not have.

---

## Opening — 20 seconds

> "DealFlow360 is a B2B sales operations platform. The ordinary version of this is
> quote, confirm, invoice. The interesting part is everything that goes wrong around
> that — discounts that need approving, stock spread across warehouses, subscriptions and
> hardware on one order, and customers who want to negotiate.
>
> So I built it as a deal engine that governs itself. A rep never asks for approval; the
> system scores the quotation and routes it."

Then start clicking. Do not keep talking over the intro.

---

## Flow 1 — quotation to cash (2 min 30)

### 1. Build the quote  · 40s

New quotation → **Acme Corp**.

> "Acme is Gold, so 15% is their entitlement. Watch what that actually means."

Add **Workstation Laptop ×10 at 12%**.

> "Hardware tolerates 15%, so twelve is fine. Risk score zero, no approval needed."

Add **Onsite Setup Service ×2 at 18%**.

> "Now look. The score jumped to 8 — because Services only tolerate 10%, whatever the
> customer's tier says. Every line is checked against the stricter of the two ceilings."

**Point at the risk panel.** This is the highest-value ten seconds of the demo.

> "And it shows its work. The service line, its 10% ceiling, that the ceiling came from the
> category rather than the tier, 8 points over, and 13% of order value. Both signals are
> shown — severity won here, but you can see the aggregate one was checked too."

### 2. Upsell  · 20s

Add the **Docking Station** from the suggestions panel.

> "Ranked on how often these are actually bought together, with a boost because it is
> promoted. It shows the margin impact before you click, not after. And anything that
> would breach its own margin floor never appears at all."

### 3. Approval routes itself  · 30s

Click **Submit**.

> "I never chose an approver. Score 8 falls in the 'manager then finance' band, so it
> needs both. Those bands are rows in a table — I will change one in a moment."

Switch to manager → **Approvals** → approve. Try to confirm.

> "Blocked. Finance has not signed off yet, and the chain runs in order — finance is never
> asked to review something the manager has not seen."

Switch to finance → approve.

### 4. Confirm  · 40s

Confirm the order.

> "One transaction just did five things: created the order, planned the warehouse split,
> reserved the stock, raised the invoice and opened the billing schedule. Either all of it
> happened or none of it did — stock reserved against an invoice that was never raised is
> exactly the corruption you cannot unpick later."

**Point at the fulfilment panel.**

> "Two shipments. Neither warehouse could cover the order alone, so it split — and it says
> why it chose each one. Minimising shipments is the set cover problem, which is NP-hard,
> so this is the greedy approximation, weighted by order value rather than unit count."

**Point at billing.**

> "One-time hardware on one invoice, the subscription on its own schedule with its own
> forward billing calendar. Same order, two billing shapes."

### 5. Payment  · 20s

Record a part payment, then the rest.

> "Status is derived from what was received, never asserted. Partial payments are normal,
> and overpayment is refused."

---

## Flow 2 — customer negotiation (1 min 30)

### 1. Send a clean quote  · 20s

New quotation, laptops at **5%**, submit.

> "Score zero, so it is approved automatically — no human touched it. That is the point:
> governance should only cost time when something is actually wrong."

Send to customer.

### 2. Switch to the customer window  · 30s

> "Separate login, separate surface. No sidebar, no internal navigation. This customer is
> bound to Acme Corp — every query is scoped from their session, so another customer's
> quotation returns *not found*, the same answer as one that does not exist.
>
> And there is no risk score here, no decision trace, no margin. The view model is built
> field by field rather than spreading a database row, so a column added next week cannot
> leak into a customer's browser."

Counter-offer at **20%** with a message.

### 3. Back to the rep  · 40s

Accept the counter.

> "Twenty percent against a fifteen percent ceiling. It re-scored to 7.5 and pushed itself
> straight back into approval — nobody had to remember to re-check it.
>
> That closes the obvious exploit: submit a clean quote, get it approved, then quietly
> raise the discount."

Try to confirm — blocked.

---

## The closer — 40 seconds

This is where the demo becomes a conversation. Pick whichever lands.

### If they seem sceptical it is real

Open a terminal.

```bash
npm test        # 183 unit tests, about half a second
npm run verify  # 62 assertions against the running server (29 access + 33 lifecycle)
```

> "The business rules live in a layer that imports nothing — no framework, no database, no
> clock. That is what makes them testable directly, and it is the honest answer to whether
> they are real."

### If they ask about configuration

Admin → **Risk Config** → change the amplifier. Reload a quotation.

> "It re-routes. No redeploy. Every governance number — the amplifier, the approval bands,
> the category ceilings, the stall window, the anomaly sensitivity — is a database row."

### If they want to see the data

```bash
psql -d dealflow360
```

> "Local Postgres. Ask it anything you like."

### If time is short, end on this

Deal Health.

> "A rep's discount is judged against *their own* history, not a company average. A rep who
> habitually sells at 12% is not behaving oddly at 13%. A rep who never exceeds 3%
> suddenly quoting 13% is. A single threshold cannot tell those apart."

---

## Scalability demonstration

Optional extension if reviewers ask about volume or system performance.

Warning: Bulk data floods the deal-health dashboard with synthetic anomalies, so it must not be loaded during the main demo.

Exact command sequence:

1. **Seed bulk quotations:**
   ```bash
   npm run db:seed:bulk
   ```
   Loads 405 quotations (45 across each of the 9 statuses) and 40 customers into local Postgres.

2. **Show the pipeline board:**
   Open `/workspace`. The board renders all columns and deal cards in ~0.3s without pagination lag.

3. **Verify access control under volume:**
   ```bash
   npm run verify:access
   ```
   Confirms all 29 access and tenancy assertions still pass (29/29) with 405 quotations in the database.

4. **Reset back to demo state:**
   ```bash
   npm run verify:flow
   ```
   Reseeds the database to the clean initial state as its first action and verifies the 33 lifecycle assertions.

---

## Timing discipline

| Segment | Budget |
|---|---|
| Opening | 0:20 |
| Flow 1 | 2:30 |
| Flow 2 | 1:30 |
| Closer | 0:40 |
| **Total** | **5:00** |

Two rules. **Do not narrate what is on screen** — they can read. Say the thing the screen
cannot tell them: why it works that way. And when a reviewer interrupts with a question,
stop the demo and answer it. The question is worth more than the remaining script.
