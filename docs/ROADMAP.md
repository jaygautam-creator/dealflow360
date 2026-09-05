# What I would build next

The deliverable asks what the team would build with more time. This is that list, ordered
by what I would actually reach for first rather than by what sounds most impressive.

Everything here is a known gap, not a discovered one — each was a deliberate trade made
against a 24-hour budget, and the reasoning is recorded alongside so the decision can be
re-examined rather than rediscovered.

---

## 1. A scheduler that acts on the billing calendar

**Today:** confirming an order opens a `BillingSchedule` with a correct `nextBillingDate`,
and the first period is invoiced immediately. Nothing then advances it.

**Next:** a cron job that wakes daily, finds schedules due, raises the invoice, and calls
`advanceSchedule` to roll the period forward. The domain function already exists and is
tested; what is missing is the thing that calls it.

**Why first:** it is the only place where the system currently describes a future it does
not carry out. Everything else is honest about its scope; this one has a calendar that
nothing reads.

**The interesting part** is idempotency. A scheduler that runs twice must not bill twice,
so the invoice write needs a uniqueness constraint on `(scheduleId, periodStart)` rather
than a "have I run today" flag — the flag is a lie the moment two workers exist.

## 2. Multi-currency

**Today:** `Customer.currency` and `PriceList.currency` exist and are carried through, but
nothing converts. Every figure is INR.

**Next:** an exchange-rate table with effective dates, and a rate **snapshotted onto the
quotation** at confirmation.

**The decision that matters:** a quotation confirmed in March must still reconcile in
September at the March rate. Looking the rate up live at read time would mean historical
invoices quietly changing value, which is the same class of mistake as joining a price
list at read time instead of snapshotting `unitPrice` — a mistake this schema already
avoids in the one place it currently can.

## 3. Materialised deal-health aggregates

**Today:** the dashboard aggregates across every quotation on each request. At seed scale
that is a few milliseconds.

**Next:** a materialised view refreshed on a short interval, with the alert lists still
computed live.

**Why not now:** it would have been premature. The right trigger is a measurement, not a
guess — when the dashboard query passes roughly 200ms I would move it, and not before.

**The subtlety:** the anomaly detector must stay live. A stale alert is worse than none,
because a manager who learns to distrust the numbers stops reading them.

## 4. Optimal warehouse splitting for small orders

**Today:** greedy set cover, which is within a `ln(n)` factor of optimal.

**Next:** exhaustive search when the warehouse count is small enough to afford it
(roughly `2^W` under about 15), falling back to greedy above that.

**Why it is worth doing:** most real orders touch few warehouses, so the exact answer is
usually cheap, and "we ship in two parcels instead of three" is a genuine cost saving.
The greedy result is already good; this makes it provably best in the common case.

**Honest note:** this is an optimisation, not a fix. I would want the shipment-count data
from real usage before spending time on it.

## 5. Approval delegation and escalation

**Today:** an approval waits indefinitely for a named level. If the manager is on leave,
the deal sits.

**Next:** out-of-office delegation, and time-based escalation to the next level up after a
configured wait — reusing the existing `ApprovalRule` table rather than inventing a second
mechanism.

**Why it matters:** the stalled-deal detector currently reports approvals that are stuck
on a person, without doing anything about it. Detecting a problem the system caused is
only half the job.

## 6. Rate limiting and account lockout

**Today:** the login endpoint does not throttle. It resists user enumeration — the same
response and the same timing for unknown user and wrong password — but nothing stops a
thousand attempts.

**Next:** a sliding-window limit per IP and per account, with exponential backoff.

**Why not now:** a hackathon build behind a local database has no exposure. It would be
the first thing I added before anything real, and I would rather say so than pretend it
was not a gap.

## 7. Tests above the domain layer

**Today:** 185 unit tests cover the business rules, and 62 live assertions cover access
control and the full lifecycle end to end. The React components have no tests.

**Next:** component tests for the quotation builder — particularly that the risk panel
renders every line of a trace, since that panel is the system's explanation of itself.

**Why the current split was right:** with 24 hours I put the tests where the risk was.
A rendering bug is visible the moment anyone opens the page. A scoring bug is invisible
until it has approved something it should not have.

---

## Two things I would change about the build itself

**Document numbering should use a Postgres sequence.** It currently counts existing rows.
Under genuinely concurrent confirmation two callers could compute the same number, and the
unique constraint would reject the loser rather than silently duplicate — safe, but it
fails a request that should have succeeded.

**Stock decrements should take an explicit row lock.** They happen inside the confirmation
transaction, so two simultaneous confirmations cannot both claim the last unit. Under real
contention I would add `SELECT ... FOR UPDATE` to make the serialisation explicit rather
than dependent on the isolation level being what I assumed.
