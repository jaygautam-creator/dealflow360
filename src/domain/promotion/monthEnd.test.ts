import { describe, expect, it } from "vitest";
import {
  DEFAULT_MONTH_END_POLICY,
  daysToMonthEnd,
  evaluateMonthEndOffer,
  isMonthEndWindow,
  type GiftCandidate,
  type MonthEndLineInput,
} from "./monthEnd";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** A hardware line at 5% against a 15% ceiling: 10 points of headroom. */
const line = (over: Partial<MonthEndLineInput> = {}): MonthEndLineInput => ({
  lineId: "l1",
  productName: "Industrial Router",
  categoryName: "Hardware",
  currentDiscountPct: 5,
  categoryMaxDiscountPct: 15,
  grossPaise: 10_000_00,
  ...over,
});

const gift = (over: Partial<GiftCandidate> = {}): GiftCandidate => ({
  productId: "p1",
  productName: "Mounting Kit",
  categoryName: "Hardware",
  listPricePaise: 200_00,
  ...over,
});

describe("daysToMonthEnd", () => {
  it("counts the last day of the month as zero", () => {
    expect(daysToMonthEnd(utc(2026, 1, 31))).toBe(0);
  });

  it("handles February in a non-leap year", () => {
    expect(daysToMonthEnd(utc(2026, 2, 28))).toBe(0);
    expect(daysToMonthEnd(utc(2026, 2, 25))).toBe(3);
  });

  it("handles February in a leap year", () => {
    expect(daysToMonthEnd(utc(2028, 2, 28))).toBe(1);
    expect(daysToMonthEnd(utc(2028, 2, 29))).toBe(0);
  });

  it("handles a 30-day month", () => {
    expect(daysToMonthEnd(utc(2026, 4, 25))).toBe(5);
  });
});

describe("isMonthEndWindow", () => {
  it("opens on the dates the reviewer named: 25th, 26th, 29th of a 31-day month", () => {
    for (const d of [25, 26, 29, 31]) {
      expect(isMonthEndWindow(utc(2026, 3, d), DEFAULT_MONTH_END_POLICY)).toBe(true);
    }
  });

  it("stays shut mid-month", () => {
    for (const d of [1, 10, 15, 20, 24]) {
      expect(isMonthEndWindow(utc(2026, 3, d), DEFAULT_MONTH_END_POLICY)).toBe(false);
    }
  });

  it("opens earlier in a short month, because the window is days-to-end not a date", () => {
    // 22 February 2026: 6 days remain, so the window is open even though 22 < 25.
    expect(isMonthEndWindow(utc(2026, 2, 22), DEFAULT_MONTH_END_POLICY)).toBe(true);
  });
});

describe("evaluateMonthEndOffer", () => {
  it("refuses outside the window and says how long the wait is", () => {
    const offer = evaluateMonthEndOffer(utc(2026, 3, 10), [line()], []);
    expect(offer.eligible).toBe(false);
    if (!offer.eligible) expect(offer.reason).toContain("21 days remain");
  });

  it("refuses an empty quotation", () => {
    expect(evaluateMonthEndOffer(utc(2026, 3, 29), [], []).eligible).toBe(false);
  });

  it("grants the full bonus when the category ceiling has room", () => {
    const offer = evaluateMonthEndOffer(utc(2026, 3, 29), [line()], []);
    expect(offer.eligible).toBe(true);
    if (!offer.eligible) return;
    expect(offer.lineBonuses[0].bonusPct).toBe(3);
    expect(offer.lineBonuses[0].resultingDiscountPct).toBe(8);
  });

  it("NEVER pushes a line past its category ceiling — the governance property", () => {
    // 14% against a 15% ceiling: only 1 point of headroom, not the full 3.
    const offer = evaluateMonthEndOffer(
      utc(2026, 3, 29),
      [line({ currentDiscountPct: 14 })],
      [],
    );
    expect(offer.eligible).toBe(true);
    if (!offer.eligible) return;
    expect(offer.lineBonuses[0].bonusPct).toBe(1);
    expect(offer.lineBonuses[0].resultingDiscountPct).toBe(15);
    expect(offer.lineBonuses[0].reason).toContain("trimmed");
  });

  it("grants nothing to a line already at the ceiling, and explains why", () => {
    const offer = evaluateMonthEndOffer(
      utc(2026, 3, 29),
      [line({ currentDiscountPct: 15 })],
      [],
    );
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.lineBonuses[0].bonusPct).toBe(0);
    expect(offer.lineBonuses[0].savingPaise).toBe(0);
    expect(offer.lineBonuses[0].reason).toContain("already at the Hardware ceiling");
  });

  it("never grants a negative bonus when a line is somehow over its ceiling", () => {
    const offer = evaluateMonthEndOffer(
      utc(2026, 3, 29),
      [line({ currentDiscountPct: 40 })],
      [],
    );
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.lineBonuses[0].bonusPct).toBe(0);
    expect(offer.lineBonuses[0].resultingDiscountPct).toBe(40);
  });

  it("computes the saving in whole paise, never a float", () => {
    const offer = evaluateMonthEndOffer(utc(2026, 3, 29), [line()], []);
    if (!offer.eligible) throw new Error("expected eligible");
    // 3% of ₹10,000.00 = ₹300.00 = 30000 paise
    expect(offer.totalSavingPaise).toBe(300_00);
    expect(Number.isInteger(offer.totalSavingPaise)).toBe(true);
  });

  it("clamps each line against its own category, not a shared one", () => {
    const offer = evaluateMonthEndOffer(
      utc(2026, 3, 29),
      [
        line({ lineId: "a", categoryName: "Hardware", categoryMaxDiscountPct: 15, currentDiscountPct: 5 }),
        line({ lineId: "b", categoryName: "Service", categoryMaxDiscountPct: 10, currentDiscountPct: 9 }),
      ],
      [],
    );
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.lineBonuses.find((b) => b.lineId === "a")!.bonusPct).toBe(3);
    expect(offer.lineBonuses.find((b) => b.lineId === "b")!.bonusPct).toBe(1);
  });
});

describe("month-end gift", () => {
  it("includes an accessory inside the gift budget", () => {
    // Order gross ₹10,000 → 5% budget = ₹500. A ₹200 kit fits.
    const offer = evaluateMonthEndOffer(utc(2026, 3, 29), [line()], [gift()]);
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.gift?.productName).toBe("Mounting Kit");
  });

  it("refuses a gift that is too expensive for the order", () => {
    const offer = evaluateMonthEndOffer(
      utc(2026, 3, 29),
      [line()],
      [gift({ listPricePaise: 5_000_00 })],
    );
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.gift).toBeNull();
  });

  it("picks the best affordable accessory, not the cheapest", () => {
    const offer = evaluateMonthEndOffer(utc(2026, 3, 29), [line()], [
      gift({ productId: "cheap", productName: "Cable", listPricePaise: 50_00 }),
      gift({ productId: "best", productName: "Rack Shelf", listPricePaise: 480_00 }),
      gift({ productId: "toobig", productName: "Spare Router", listPricePaise: 9_000_00 }),
    ]);
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.gift?.productId).toBe("best");
  });

  it("offers no gift when nothing is configured as an accessory", () => {
    const offer = evaluateMonthEndOffer(utc(2026, 3, 29), [line()], []);
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.gift).toBeNull();
  });

  it("offers no gift on a zero-value order", () => {
    const offer = evaluateMonthEndOffer(
      utc(2026, 3, 29),
      [line({ grossPaise: 0 })],
      [gift()],
    );
    if (!offer.eligible) throw new Error("expected eligible");
    expect(offer.gift).toBeNull();
  });
});
