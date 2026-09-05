import { addMonths, addYears, differenceInCalendarDays } from "../shared/dates";
import { roundPaise, safeRatio, sumPaise } from "../shared/money";
import type {
  BillingInterval,
  BillingSplit,
  OneTimeLineInput,
  ProrationResult,
  RecurringLineInput,
  ScheduleEntry,
} from "./types";

/**
 * Hybrid billing
 * ==============
 *
 * A single order may mix hardware billed once with subscriptions billed forever. Rather
 * than forcing the rep to raise two orders, the order stays whole and *billing* splits:
 * one-time lines collapse into a single invoice, and each recurring line gets its own
 * forward billing calendar.
 *
 * Every function here takes the current date as an argument instead of reading the clock.
 * That is deliberate — it makes proration deterministic and testable, and it means an
 * invoice can be regenerated later for an audit and produce byte-identical numbers.
 */

/** Advances a date by exactly one billing interval, preserving the anniversary day. */
export function addInterval(from: Date, interval: BillingInterval): Date {
  switch (interval) {
    case "MONTHLY":
      return addMonths(from, 1);
    case "QUARTERLY":
      return addMonths(from, 3);
    case "YEARLY":
      return addYears(from, 1);
  }
}

/** How many times a given interval bills in a year. Used for annual recurring revenue. */
export function periodsPerYear(interval: BillingInterval): number {
  switch (interval) {
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "YEARLY":
      return 1;
  }
}

/**
 * Splits a confirmed order into the one-time invoice and the recurring schedules.
 * Periods are anniversary-based from the confirmation date, not calendar months, so a
 * subscription started on the 15th always bills on the 15th.
 */
export function splitBilling(
  confirmedAt: Date,
  oneTimeLines: readonly OneTimeLineInput[],
  recurringLines: readonly RecurringLineInput[],
): BillingSplit {
  const oneTimeNet = sumPaise(oneTimeLines.map((l) => l.netAmountPaise));
  const oneTimeTax = sumPaise(oneTimeLines.map((l) => l.taxPaise));

  const schedules: ScheduleEntry[] = recurringLines.map((line) => {
    const periodEnd = addInterval(confirmedAt, line.interval);
    return {
      lineId: line.lineId,
      planId: line.planId,
      planName: line.planName,
      productName: line.productName,
      interval: line.interval,
      amountPerPeriodPaise: line.unitAmountPaise * line.quantity,
      periodStart: confirmedAt,
      periodEnd,
      // The first period is billed on confirmation, so the *next* charge is at period end.
      nextBillingDate: periodEnd,
    };
  });

  const annualRecurringPaise = sumPaise(
    schedules.map((s) => s.amountPerPeriodPaise * periodsPerYear(s.interval)),
  );

  return {
    // Null rather than zero: an all-subscription order should raise no one-time invoice
    // at all, which is a different thing from raising one for nothing.
    oneTimeInvoicePaise: oneTimeLines.length === 0 ? null : oneTimeNet + oneTimeTax,
    oneTimeTaxPaise: oneTimeTax,
    schedules,
    annualRecurringPaise,
  };
}

/**
 * Prorates a mid-period change in quantity or plan.
 *
 * The customer has already paid for the whole current period at the old rate. So we credit
 * back the unused remainder at the old rate, and charge that same remainder at the new
 * rate. Only the remaining days move; the days already consumed are settled and untouched.
 *
 * Proration is day-based rather than second-based, which is what finance teams expect on
 * an invoice line and keeps the arithmetic explainable to a customer.
 */
export function prorateChange(
  periodStart: Date,
  periodEnd: Date,
  changeDate: Date,
  oldAmountPerPeriodPaise: number,
  newAmountPerPeriodPaise: number,
): ProrationResult {
  const daysInPeriod = differenceInCalendarDays(periodEnd, periodStart);
  // Clamp so a change dated outside the period cannot produce a negative or oversized credit.
  const rawUsed = differenceInCalendarDays(changeDate, periodStart);
  const daysUsed = Math.min(Math.max(rawUsed, 0), daysInPeriod);
  const daysRemaining = daysInPeriod - daysUsed;

  const remainingFraction = safeRatio(daysRemaining, daysInPeriod);
  const creditPaise = roundPaise(oldAmountPerPeriodPaise * remainingFraction);
  const chargePaise = roundPaise(newAmountPerPeriodPaise * remainingFraction);
  const netPaise = chargePaise - creditPaise;

  return {
    daysUsed,
    daysRemaining,
    daysInPeriod,
    creditPaise,
    chargePaise,
    netPaise,
    explanation:
      daysInPeriod === 0
        ? "The billing period has zero length, so nothing is prorated."
        : `${daysUsed} of ${daysInPeriod} days were already used. The remaining ${daysRemaining} days are credited at the old rate and re-charged at the new rate.`,
  };
}

/**
 * Prorates a mid-period cancellation into a credit note.
 *
 * Only the unused remainder is refundable, and the plan may return less than all of it —
 * SubscriptionPlan.refundPctOnCancel is the policy knob, so a "no refunds" plan and a
 * "full pro-rata refund" plan are both configuration rather than separate code paths.
 */
export function prorateCancellation(
  periodStart: Date,
  periodEnd: Date,
  cancelDate: Date,
  amountPerPeriodPaise: number,
  refundPctOnCancel: number,
): ProrationResult {
  const base = prorateChange(periodStart, periodEnd, cancelDate, amountPerPeriodPaise, 0);
  const creditPaise = roundPaise((base.creditPaise * refundPctOnCancel) / 100);

  return {
    ...base,
    creditPaise,
    chargePaise: 0,
    netPaise: -creditPaise,
    explanation:
      refundPctOnCancel === 0
        ? `Cancelled with ${base.daysRemaining} days remaining, but this plan refunds nothing on cancellation.`
        : `Cancelled with ${base.daysRemaining} of ${base.daysInPeriod} days unused. ${refundPctOnCancel}% of that remainder is returned as a credit note.`,
  };
}

/**
 * Rolls a schedule forward after a successful charge. Returned as a new object rather
 * than mutating, so the caller decides when to persist.
 */
export function advanceSchedule(entry: ScheduleEntry): ScheduleEntry {
  return {
    ...entry,
    periodStart: entry.periodEnd,
    periodEnd: addInterval(entry.periodEnd, entry.interval),
    nextBillingDate: addInterval(entry.periodEnd, entry.interval),
  };
}

/** Projects the next N billing dates, for the schedule preview on the billing screen. */
export function projectBillingDates(entry: ScheduleEntry, count: number): Date[] {
  const dates: Date[] = [];
  let cursor = entry.nextBillingDate;
  for (let i = 0; i < count; i++) {
    dates.push(cursor);
    cursor = addInterval(cursor, entry.interval);
  }
  return dates;
}
