import { describe, it, expect } from "vitest";
import { addDays, addMonths, addYears, daysInMonth, differenceInCalendarDays } from "./dates";

const d = (iso: string) => new Date(iso);

describe("month length", () => {
  it("knows the ordinary months", () => {
    expect(daysInMonth(2026, 0)).toBe(31); // January
    expect(daysInMonth(2026, 3)).toBe(30); // April
  });

  it("applies the Gregorian leap rule", () => {
    expect(daysInMonth(2027, 1)).toBe(28); // not divisible by 4
    expect(daysInMonth(2028, 1)).toBe(29); // divisible by 4
    expect(daysInMonth(2100, 1)).toBe(28); // century, not divisible by 400
    expect(daysInMonth(2000, 1)).toBe(29); // divisible by 400
  });
});

describe("adding months", () => {
  it("preserves the anniversary day in an ordinary month", () => {
    expect(addMonths(d("2026-01-15T00:00:00Z"), 1)).toEqual(d("2026-02-15T00:00:00Z"));
    expect(addMonths(d("2026-01-15T00:00:00Z"), 3)).toEqual(d("2026-04-15T00:00:00Z"));
  });

  it("clamps to month end rather than rolling into the next month", () => {
    // The behaviour that matters: 31 January + 1 month is 28 February, not 3 March.
    // Rolling over would shift every later billing date for that subscription.
    expect(addMonths(d("2026-01-31T00:00:00Z"), 1)).toEqual(d("2026-02-28T00:00:00Z"));
    expect(addMonths(d("2026-03-31T00:00:00Z"), 1)).toEqual(d("2026-04-30T00:00:00Z"));
  });

  it("clamps to 29 February in a leap year", () => {
    expect(addMonths(d("2028-01-31T00:00:00Z"), 1)).toEqual(d("2028-02-29T00:00:00Z"));
  });

  it("crosses a year boundary correctly", () => {
    expect(addMonths(d("2026-11-15T00:00:00Z"), 3)).toEqual(d("2027-02-15T00:00:00Z"));
    expect(addMonths(d("2026-12-31T00:00:00Z"), 1)).toEqual(d("2027-01-31T00:00:00Z"));
  });

  it("does not lose the year when the intermediate month would roll over", () => {
    // 31 December is the case that breaks a naive setUTCMonth implementation.
    expect(addMonths(d("2026-12-31T00:00:00Z"), 2)).toEqual(d("2027-02-28T00:00:00Z"));
  });

  it("preserves the time of day", () => {
    expect(addMonths(d("2026-01-15T09:30:00Z"), 1)).toEqual(d("2026-02-15T09:30:00Z"));
  });
});

describe("adding years", () => {
  it("preserves the anniversary", () => {
    expect(addYears(d("2026-01-15T00:00:00Z"), 1)).toEqual(d("2027-01-15T00:00:00Z"));
  });

  it("clamps 29 February to 28 February in a non-leap year", () => {
    expect(addYears(d("2028-02-29T00:00:00Z"), 1)).toEqual(d("2029-02-28T00:00:00Z"));
  });
});

describe("calendar day difference", () => {
  it("counts whole days across a month", () => {
    expect(differenceInCalendarDays(d("2026-01-31T00:00:00Z"), d("2026-01-01T00:00:00Z"))).toBe(30);
  });

  it("ignores the time of day", () => {
    // A customer cancelling at 11pm has used that day. Elapsed-hours maths would
    // disagree with the calendar and be impossible to explain on an invoice.
    expect(differenceInCalendarDays(d("2026-01-02T23:59:00Z"), d("2026-01-01T00:01:00Z"))).toBe(1);
  });

  it("returns zero for the same day", () => {
    expect(differenceInCalendarDays(d("2026-01-01T18:00:00Z"), d("2026-01-01T02:00:00Z"))).toBe(0);
  });

  it("returns a negative value when the dates are reversed", () => {
    expect(differenceInCalendarDays(d("2026-01-01T00:00:00Z"), d("2026-01-11T00:00:00Z"))).toBe(-10);
  });

  it("counts correctly across a leap day", () => {
    expect(differenceInCalendarDays(d("2028-03-01T00:00:00Z"), d("2028-02-28T00:00:00Z"))).toBe(2);
  });
});

describe("adding days", () => {
  it("crosses a month boundary", () => {
    expect(addDays(d("2026-01-28T00:00:00Z"), 5)).toEqual(d("2026-02-02T00:00:00Z"));
  });
});
