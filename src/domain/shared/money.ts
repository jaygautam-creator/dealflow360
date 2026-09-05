/**
 * Money handling for the whole domain layer.
 *
 * Rule: no floating-point arithmetic is ever performed on money. Every monetary value
 * inside the domain is an integer number of *paise* (1/100 of a rupee), the same
 * approach Stripe and most ledger systems use. Conversion to and from the database's
 * DECIMAL(14,2) columns happens once, at the infrastructure boundary.
 *
 * Percentages remain plain numbers (e.g. 12.5 means 12.5%), but every calculation that
 * turns a percentage into money rounds to whole paise immediately, so rounding error
 * can never accumulate across lines.
 */

/** An integer count of paise. Negative values are legal (credits, refunds). */
export type Paise = number;

/** Rounds to the nearest whole paisa, away from zero on an exact .5 (banker-free, predictable). */
export function roundPaise(value: number): Paise {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Converts a rupee amount (as a number or DECIMAL string from the DB) into paise. */
export function toPaise(rupees: number | string): Paise {
  const n = typeof rupees === "string" ? Number(rupees) : rupees;
  if (!Number.isFinite(n)) throw new Error(`toPaise: not a finite number: ${rupees}`);
  return roundPaise(n * 100);
}

/** Converts paise back to a rupee number, for display or for writing to a DECIMAL column. */
export function toRupees(paise: Paise): number {
  return paise / 100;
}

/** Formats paise as a rupee string with two decimals. Display only — never used in maths. */
export function formatPaise(paise: Paise): string {
  return (paise / 100).toFixed(2);
}

/**
 * Applies a percentage to a paise amount, rounding to whole paise.
 * `pct` is expressed as a human percentage: 12.5 means 12.5%.
 */
export function applyPct(amount: Paise, pct: number): Paise {
  return roundPaise((amount * pct) / 100);
}

/** Sums a list of paise amounts. Exact, because every element is already an integer. */
export function sumPaise(values: readonly Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0);
}

/** Guards against division by zero when computing ratios such as margin or value weight. */
export function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Rounds a percentage to two decimals, matching the DECIMAL(5,2) columns it is stored in. */
export function roundPct(pct: number): number {
  return Math.round(pct * 100) / 100;
}
