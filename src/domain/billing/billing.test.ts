import { describe, it, expect } from "vitest";
import {
  addInterval,
  advanceSchedule,
  periodsPerYear,
  projectBillingDates,
  prorateCancellation,
  prorateChange,
  splitBilling,
} from "./billing";
import { toPaise } from "../shared/money";
import type { OneTimeLineInput, RecurringLineInput } from "./types";

const JAN_15 = new Date("2026-01-15T00:00:00Z");

const laptop: OneTimeLineInput = {
  lineId: "HW",
  productName: "Laptop",
  quantity: 2,
  netAmountPaise: toPaise(100_000),
  taxPaise: toPaise(18_000),
};

const support: RecurringLineInput = {
  lineId: "SUB",
  productName: "Support Plan",
  planId: "p1",
  planName: "Monthly Support",
  interval: "MONTHLY",
  quantity: 2,
  unitAmountPaise: toPaise(5_000),
};

describe("hybrid billing — splitting one order into two billing shapes", () => {
  it("raises one invoice for the one-time lines and a schedule for the recurring ones", () => {
    const split = splitBilling(JAN_15, [laptop], [support]);
    expect(split.oneTimeInvoicePaise).toBe(toPaise(118_000));
    expect(split.schedules).toHaveLength(1);
    expect(split.schedules[0].amountPerPeriodPaise).toBe(toPaise(10_000));
  });

  it("raises no one-time invoice at all for an all-subscription order", () => {
    const split = splitBilling(JAN_15, [], [support]);
    // Null, not zero — an invoice for nothing is not the same as no invoice.
    expect(split.oneTimeInvoicePaise).toBeNull();
    expect(split.schedules).toHaveLength(1);
  });

  it("produces no schedules for an order with no subscriptions", () => {
    const split = splitBilling(JAN_15, [laptop], []);
    expect(split.schedules).toEqual([]);
    expect(split.annualRecurringPaise).toBe(0);
  });

  it("bills the first period immediately and sets the next charge at period end", () => {
    const split = splitBilling(JAN_15, [], [support]);
    const s = split.schedules[0];
    expect(s.periodStart).toEqual(JAN_15);
    expect(s.periodEnd).toEqual(new Date("2026-02-15T00:00:00Z"));
    expect(s.nextBillingDate).toEqual(s.periodEnd);
  });

  it("computes annual recurring revenue across mixed intervals", () => {
    const split = splitBilling(JAN_15, [], [
      { ...support, lineId: "M", interval: "MONTHLY", quantity: 1, unitAmountPaise: toPaise(1_000) },
      { ...support, lineId: "Q", interval: "QUARTERLY", quantity: 1, unitAmountPaise: toPaise(3_000) },
      { ...support, lineId: "Y", interval: "YEARLY", quantity: 1, unitAmountPaise: toPaise(10_000) },
    ]);
    // 1000x12 + 3000x4 + 10000x1 = 12,000 + 12,000 + 10,000
    expect(split.annualRecurringPaise).toBe(toPaise(34_000));
  });

  it("keeps the anniversary day when advancing a period", () => {
    expect(addInterval(JAN_15, "MONTHLY")).toEqual(new Date("2026-02-15T00:00:00Z"));
    expect(addInterval(JAN_15, "QUARTERLY")).toEqual(new Date("2026-04-15T00:00:00Z"));
    expect(addInterval(JAN_15, "YEARLY")).toEqual(new Date("2027-01-15T00:00:00Z"));
  });

  it("knows how often each interval bills in a year", () => {
    expect(periodsPerYear("MONTHLY")).toBe(12);
    expect(periodsPerYear("QUARTERLY")).toBe(4);
    expect(periodsPerYear("YEARLY")).toBe(1);
  });
});

describe("proration — mid-period quantity change", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date("2026-01-31T00:00:00Z"); // 30-day period

  it("credits the unused remainder and charges it at the new rate", () => {
    // Halfway through: 15 of 30 days used. Upgrading from 1,000 to 2,000 per period.
    const r = prorateChange(start, end, new Date("2026-01-16T00:00:00Z"), toPaise(1_000), toPaise(2_000));
    expect(r.daysInPeriod).toBe(30);
    expect(r.daysUsed).toBe(15);
    expect(r.daysRemaining).toBe(15);
    expect(r.creditPaise).toBe(toPaise(500));
    expect(r.chargePaise).toBe(toPaise(1_000));
    expect(r.netPaise).toBe(toPaise(500));
  });

  it("returns a negative net when the customer downgrades", () => {
    const r = prorateChange(start, end, new Date("2026-01-16T00:00:00Z"), toPaise(2_000), toPaise(1_000));
    expect(r.netPaise).toBe(toPaise(-500));
  });

  it("charges the full difference when the change lands on the first day", () => {
    const r = prorateChange(start, end, start, toPaise(1_000), toPaise(2_000));
    expect(r.daysRemaining).toBe(30);
    expect(r.creditPaise).toBe(toPaise(1_000));
    expect(r.chargePaise).toBe(toPaise(2_000));
  });

  it("moves nothing when the change lands on the last day", () => {
    const r = prorateChange(start, end, end, toPaise(1_000), toPaise(2_000));
    expect(r.daysRemaining).toBe(0);
    expect(r.netPaise).toBe(0);
  });

  it("clamps a change dated before the period rather than over-crediting", () => {
    const r = prorateChange(start, end, new Date("2025-12-01T00:00:00Z"), toPaise(1_000), toPaise(2_000));
    expect(r.daysUsed).toBe(0);
    expect(r.daysRemaining).toBe(30);
  });

  it("clamps a change dated after the period rather than producing a negative credit", () => {
    const r = prorateChange(start, end, new Date("2026-03-01T00:00:00Z"), toPaise(1_000), toPaise(2_000));
    expect(r.daysUsed).toBe(30);
    expect(r.daysRemaining).toBe(0);
    expect(r.creditPaise).toBe(0);
  });

  it("survives a zero-length period without dividing by zero", () => {
    const r = prorateChange(start, start, start, toPaise(1_000), toPaise(2_000));
    expect(r.daysInPeriod).toBe(0);
    expect(r.netPaise).toBe(0);
    expect(r.explanation).toContain("zero length");
  });
});

describe("proration — cancellation and credit notes", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date("2026-01-31T00:00:00Z");
  const mid = new Date("2026-01-16T00:00:00Z");

  it("credits the full unused remainder on a fully-refundable plan", () => {
    const r = prorateCancellation(start, end, mid, toPaise(1_000), 100);
    expect(r.creditPaise).toBe(toPaise(500));
    expect(r.chargePaise).toBe(0);
    expect(r.netPaise).toBe(toPaise(-500));
  });

  it("credits only the configured share on a partially-refundable plan", () => {
    const r = prorateCancellation(start, end, mid, toPaise(1_000), 50);
    expect(r.creditPaise).toBe(toPaise(250));
  });

  it("credits nothing on a non-refundable plan, and says so", () => {
    const r = prorateCancellation(start, end, mid, toPaise(1_000), 0);
    expect(r.creditPaise).toBe(0);
    expect(r.explanation).toContain("refunds nothing");
  });

  it("credits nothing when cancelled on the final day", () => {
    const r = prorateCancellation(start, end, end, toPaise(1_000), 100);
    expect(r.creditPaise).toBe(0);
  });
});

describe("billing schedule progression", () => {
  const schedule = splitBilling(JAN_15, [], [support]).schedules[0];

  it("rolls forward to the next period without mutating the original", () => {
    const next = advanceSchedule(schedule);
    expect(next.periodStart).toEqual(new Date("2026-02-15T00:00:00Z"));
    expect(next.periodEnd).toEqual(new Date("2026-03-15T00:00:00Z"));
    expect(schedule.periodStart).toEqual(JAN_15); // original untouched
  });

  it("projects a forward billing calendar for the billing screen", () => {
    const dates = projectBillingDates(schedule, 3);
    expect(dates).toEqual([
      new Date("2026-02-15T00:00:00Z"),
      new Date("2026-03-15T00:00:00Z"),
      new Date("2026-04-15T00:00:00Z"),
    ]);
  });

  it("is deterministic — regenerating an old invoice gives identical numbers", () => {
    const a = prorateChange(JAN_15, addInterval(JAN_15, "MONTHLY"), new Date("2026-01-25T00:00:00Z"), toPaise(3_000), toPaise(4_500));
    const b = prorateChange(JAN_15, addInterval(JAN_15, "MONTHLY"), new Date("2026-01-25T00:00:00Z"), toPaise(3_000), toPaise(4_500));
    expect(a).toEqual(b);
  });
});
