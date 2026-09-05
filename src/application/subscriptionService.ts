import "server-only";
import { prisma } from "@/infrastructure/db";
import { prorateCancellation, prorateChange } from "@/domain/billing/billing";
import type { ProrationResult } from "@/domain/billing/types";
import { dbToPaise, dbToPct, paiseToDb } from "@/infrastructure/money";
import { scopedQuotationWhere } from "@/application/queries";
import { writeAudit } from "@/application/quotationService";
import type { SessionUser } from "@/infrastructure/auth/session";
import type { Prisma } from "@/generated/prisma";

/**
 * Subscription modify and cancel (spec B7).
 *
 * The arithmetic already exists and is unit-tested in `src/domain/billing` — this layer
 * exists only to decide *which* period is being prorated, to move the money, and to leave
 * an audit trail. It contains no proration rules of its own, deliberately: if a finance
 * reviewer disputes a number, the answer is a pure function with tests, not a query.
 *
 * The one modelling decision that lives here rather than in the domain is what "the
 * current period" means. A `BillingSchedule` stores only `nextBillingDate`, so the period
 * being interrupted is the interval that *ends* on that date. Deriving the start by
 * stepping one interval back — rather than storing it — keeps the schedule row the single
 * source of truth and makes it impossible for a stored start and a stored next date to
 * drift apart.
 */

export class SubscriptionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Steps one interval backwards. The inverse of the domain's `addInterval`. */
function periodStartFor(nextBillingDate: Date, interval: "MONTHLY" | "QUARTERLY" | "YEARLY"): Date {
  const months = interval === "MONTHLY" ? 1 : interval === "QUARTERLY" ? 3 : 12;
  const d = new Date(nextBillingDate);
  const targetMonth = d.getMonth() - months;
  const candidate = new Date(d.getFullYear(), targetMonth, d.getDate());
  // Stepping back from the 31st into a shorter month must not roll into the next one:
  // 31 March minus one month is 28 February, not 3 March. Same month-end rule the
  // forward direction uses in src/domain/shared/dates.ts.
  if (candidate.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    return new Date(d.getFullYear(), targetMonth + 1, 0);
  }
  return candidate;
}

/**
 * Loads a schedule the caller is allowed to act on.
 *
 * Scoped through `scopedQuotationWhere` like every other read, so a principal who cannot
 * see the underlying quotation cannot reach its billing schedule by guessing an id. A
 * missing row and an unauthorised row both return null, which is deliberate — telling an
 * attacker that an id exists but is forbidden is itself a disclosure.
 */
async function loadSchedule(user: SessionUser, scheduleId: string) {
  return prisma.billingSchedule.findFirst({
    where: {
      AND: [{ id: scheduleId }, { salesOrder: { quotation: scopedQuotationWhere(user) } }],
    },
    include: {
      plan: true,
      line: { select: { id: true, quantity: true, product: { select: { name: true } } } },
      salesOrder: { select: { id: true, number: true } },
    },
  });
}

/** Counting rows matches the numbering scheme the confirmation path already uses. */
async function nextCreditNoteNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.creditNote.count();
  return `CN-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.invoice.count();
  return `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * The invoice a credit note attaches to.
 *
 * A credit note is a reduction of something already billed, so it needs a real invoice to
 * reduce. We take the most recent recurring invoice for the order; if the subscription has
 * not been billed yet there is nothing to credit, and the caller is told that rather than
 * having a credit note invented against an unrelated one-time invoice.
 */
async function latestRecurringInvoice(tx: Prisma.TransactionClient, salesOrderId: string) {
  return tx.invoice.findFirst({
    where: { salesOrderId, type: "RECURRING" },
    orderBy: { createdAt: "desc" },
  });
}

export interface SubscriptionChangeResult {
  scheduleId: string;
  proration: ProrationResult;
  newAmountPerPeriodPaise: number;
  creditNoteNumber: string | null;
  invoiceNumber: string | null;
}

/**
 * Mid-cycle quantity change.
 *
 * The customer has already paid the current period at the old rate, so only the unused
 * remainder moves: it is credited at the old rate and re-charged at the new one. A net
 * increase raises a prorated invoice; a net decrease raises a credit note. Never both,
 * and never a silent adjustment with no document — a finance user must be able to point
 * at the piece of paper that explains the difference.
 */
export async function changeSubscriptionQuantity(
  user: SessionUser,
  scheduleId: string,
  newQuantity: number,
  reason: string | null,
  now: Date = new Date(),
): Promise<SubscriptionChangeResult> {
  const schedule = await loadSchedule(user, scheduleId);
  if (!schedule) throw new SubscriptionError("Subscription not found", 404);
  if (schedule.status !== "ACTIVE") {
    throw new SubscriptionError(`This subscription is ${schedule.status.toLowerCase()} and cannot be changed`);
  }
  if (!Number.isInteger(newQuantity) || newQuantity < 1) {
    throw new SubscriptionError("New quantity must be a whole number of at least 1");
  }
  const currentQuantity = schedule.line.quantity;
  if (newQuantity === currentQuantity) {
    throw new SubscriptionError("The new quantity is the same as the current quantity");
  }

  const oldAmountPaise = dbToPaise(schedule.amountPerPeriod);
  // Derive the per-unit rate from what is actually being billed rather than re-reading the
  // price list: the schedule is what the customer agreed to, and a later price change must
  // not silently re-rate an existing subscription.
  const perUnitPaise = Math.round(oldAmountPaise / currentQuantity);
  const newAmountPaise = perUnitPaise * newQuantity;

  const periodEnd = schedule.nextBillingDate;
  const periodStart = periodStartFor(periodEnd, schedule.interval);

  const proration = schedule.plan.prorateOnChange
    ? prorateChange(periodStart, periodEnd, now, oldAmountPaise, newAmountPaise)
    : // A plan configured not to prorate changes the rate from the next period onwards and
      // moves no money now. Expressed as a zero result so callers have one shape to render.
      {
        daysUsed: 0,
        daysRemaining: 0,
        daysInPeriod: 0,
        creditPaise: 0,
        chargePaise: 0,
        netPaise: 0,
        explanation: "This plan does not prorate mid-cycle changes, so the new rate applies from the next period.",
      };

  return prisma.$transaction(async (tx) => {
    await tx.billingSchedule.update({
      where: { id: schedule.id },
      data: { amountPerPeriod: paiseToDb(newAmountPaise) },
    });
    await tx.quotationLine.update({
      where: { id: schedule.line.id },
      data: { quantity: newQuantity },
    });

    let creditNoteNumber: string | null = null;
    let invoiceNumber: string | null = null;

    if (proration.netPaise < 0) {
      const invoice = await latestRecurringInvoice(tx, schedule.salesOrderId);
      if (invoice) {
        creditNoteNumber = await nextCreditNoteNumber(tx);
        await tx.creditNote.create({
          data: {
            number: creditNoteNumber,
            invoiceId: invoice.id,
            amount: paiseToDb(Math.abs(proration.netPaise)),
            reason: reason ?? `Quantity reduced from ${currentQuantity} to ${newQuantity}`,
          },
        });
      }
    } else if (proration.netPaise > 0) {
      invoiceNumber = await nextInvoiceNumber(tx);
      await tx.invoice.create({
        data: {
          number: invoiceNumber,
          type: "RECURRING",
          status: "OPEN",
          salesOrderId: schedule.salesOrderId,
          amount: paiseToDb(proration.netPaise),
          periodStart: now,
          periodEnd,
          // Flagged so the invoice reads as a part-period adjustment rather than a full
          // period billed at the wrong amount.
          isProrated: true,
          dueDate: periodEnd,
        },
      });
    }

    await writeAudit(tx, {
      entityType: "BillingSchedule",
      entityId: schedule.id,
      action: "SUBSCRIPTION_QUANTITY_CHANGED",
      actorId: user.id,
      reason,
      payload: {
        from: currentQuantity,
        to: newQuantity,
        oldAmountPerPeriodPaise: oldAmountPaise,
        newAmountPerPeriodPaise: newAmountPaise,
        proration,
        creditNoteNumber,
        invoiceNumber,
      },
    });

    return {
      scheduleId: schedule.id,
      proration,
      newAmountPerPeriodPaise: newAmountPaise,
      creditNoteNumber,
      invoiceNumber,
    };
  });
}

/**
 * Cancellation with a policy-driven partial refund.
 *
 * How much of the unused remainder comes back is `SubscriptionPlan.refundPctOnCancel`, so
 * a no-refund plan and a full pro-rata plan are the same code path with different data.
 * The schedule is marked CANCELLED rather than deleted: a subscription that existed and
 * was stopped is a different fact from one that never existed, and billing history has to
 * survive the cancellation.
 */
export async function cancelSubscription(
  user: SessionUser,
  scheduleId: string,
  reason: string | null,
  now: Date = new Date(),
): Promise<SubscriptionChangeResult> {
  const schedule = await loadSchedule(user, scheduleId);
  if (!schedule) throw new SubscriptionError("Subscription not found", 404);
  if (schedule.status !== "ACTIVE") {
    throw new SubscriptionError(`This subscription is already ${schedule.status.toLowerCase()}`);
  }

  const amountPaise = dbToPaise(schedule.amountPerPeriod);
  const periodEnd = schedule.nextBillingDate;
  const periodStart = periodStartFor(periodEnd, schedule.interval);
  const refundPct = dbToPct(schedule.plan.refundPctOnCancel);

  const proration = prorateCancellation(periodStart, periodEnd, now, amountPaise, refundPct);

  return prisma.$transaction(async (tx) => {
    await tx.billingSchedule.update({
      where: { id: schedule.id },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    let creditNoteNumber: string | null = null;
    if (proration.creditPaise > 0) {
      const invoice = await latestRecurringInvoice(tx, schedule.salesOrderId);
      if (invoice) {
        creditNoteNumber = await nextCreditNoteNumber(tx);
        await tx.creditNote.create({
          data: {
            number: creditNoteNumber,
            invoiceId: invoice.id,
            amount: paiseToDb(proration.creditPaise),
            reason: reason ?? `Subscription cancelled with ${proration.daysRemaining} days unused`,
          },
        });
        // An invoice fully cancelled out by credit notes is CREDITED, not PAID. Recomputing
        // from the rows rather than assuming keeps the status honest when several credit
        // notes stack against one invoice.
        const credited = await tx.creditNote.aggregate({
          where: { invoiceId: invoice.id },
          _sum: { amount: true },
        });
        if (dbToPaise(credited._sum.amount) >= dbToPaise(invoice.amount)) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CREDITED" } });
        }
      }
    }

    await writeAudit(tx, {
      entityType: "BillingSchedule",
      entityId: schedule.id,
      action: "SUBSCRIPTION_CANCELLED",
      actorId: user.id,
      reason,
      payload: {
        refundPctOnCancel: refundPct,
        amountPerPeriodPaise: amountPaise,
        proration,
        creditNoteNumber,
      },
    });

    return {
      scheduleId: schedule.id,
      proration,
      newAmountPerPeriodPaise: 0,
      creditNoteNumber,
      invoiceNumber: null,
    };
  });
}
