import { toPaise, toRupees } from "@/domain/shared/money";

/**
 * The single conversion point between the database's DECIMAL columns and the domain's
 * integer paise.
 *
 * Every read from Prisma passes through `dbToPaise` and every write through `paiseToDb`.
 * Keeping both in one file means there is exactly one place where a rounding decision is
 * made, rather than an ad-hoc `Number(...)` at each call site.
 */

/** Prisma returns DECIMAL as a Decimal object; its string form is exact, unlike toNumber(). */
export function dbToPaise(value: { toString(): string } | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return toPaise(typeof value === "number" ? value : value.toString());
}

/** Paise back to a rupee number for a DECIMAL(14,2) column. */
export function paiseToDb(paise: number): number {
  return toRupees(paise);
}

/** Reads a DECIMAL percentage column as a plain number (12.50 -> 12.5). */
export function dbToPct(value: { toString(): string } | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}
