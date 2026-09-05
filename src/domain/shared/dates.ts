/**
 * Date arithmetic for billing periods.
 *
 * Written rather than imported, for two reasons. Billing correctness is the core of this
 * system, and month-end behaviour — what "one month after 31 January" means — is a
 * business decision I would rather state explicitly than inherit. And everything here
 * works in **UTC**, deliberately: a subscription period must not gain or lose a day
 * because a daylight-saving boundary fell inside it, which is exactly what happens when
 * date maths runs in local time.
 */

/** Days in a given month. Handles leap years via the standard Gregorian rule. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Adds whole months, clamping to the end of the target month.
 *
 * 31 January + 1 month is 28 February (29 in a leap year), not 3 March. Rolling over
 * would silently shift every subsequent billing date for that subscription, so the
 * anniversary is preserved wherever the target month is long enough and clamped where
 * it is not.
 */
export function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const result = new Date(date.getTime());

  // Move to the first of the month before changing month, so the intermediate value can
  // never roll into the following month and take the year with it.
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  result.setUTCDate(Math.min(day, daysInMonth(result.getUTCFullYear(), result.getUTCMonth())));

  return result;
}

/** Adds whole years. 29 February clamps to 28 February in a non-leap year. */
export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days from `from` to `to`, ignoring the time of day.
 *
 * Calendar days rather than elapsed 24-hour periods: a customer who cancels at 11pm has
 * used that day, and proration that disagrees with the calendar is impossible to explain
 * on an invoice.
 */
export function differenceInCalendarDays(to: Date, from: Date): number {
  const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((toUtc - fromUtc) / MS_PER_DAY);
}

/** Adds whole days. Used for invoice due dates. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
