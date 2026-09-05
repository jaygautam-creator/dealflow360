import { describe, it, expect } from "vitest";
import { checkStalled, checkDiscountAnomaly, checkDeliverySlippage } from "./dealHealth";

const NOW = new Date("2026-01-20T00:00:00Z");

describe("stalled deal detection", () => {
  it("flags a quotation past the configured inactivity window", () => {
    const r = checkStalled(new Date("2026-01-10T00:00:00Z"), NOW, 5);
    expect(r.isStalled).toBe(true);
    expect(r.daysInactive).toBe(10);
  });

  it("leaves a recently touched quotation alone", () => {
    expect(checkStalled(new Date("2026-01-18T00:00:00Z"), NOW, 5).isStalled).toBe(false);
  });

  it("treats the threshold day itself as stalled", () => {
    expect(checkStalled(new Date("2026-01-15T00:00:00Z"), NOW, 5).isStalled).toBe(true);
  });

  it("responds to a reconfigured window", () => {
    const last = new Date("2026-01-13T00:00:00Z"); // 7 days
    expect(checkStalled(last, NOW, 5).isStalled).toBe(true);
    expect(checkStalled(last, NOW, 14).isStalled).toBe(false);
  });
});

describe("discount anomaly detection", () => {
  it("flags a discount far above the rep's own average", () => {
    const r = checkDiscountAnomaly([2, 3, 2, 3, 2], 15, 2, 3);
    expect(r.isAnomaly).toBe(true);
    expect(r.zScore).toBeGreaterThan(2);
    expect(r.explanation).toContain("standard deviations above");
  });

  it("does not flag a discount that is normal for that rep", () => {
    // The same 13% is unremarkable for a rep who habitually discounts around 12%.
    expect(checkDiscountAnomaly([11, 12, 13, 12, 12], 13, 2, 3).isAnomaly).toBe(false);
  });

  it("judges each rep against their own history, not a company-wide number", () => {
    const conservative = checkDiscountAnomaly([2, 3, 2, 3, 2], 13, 2, 3);
    const generous = checkDiscountAnomaly([11, 12, 13, 12, 12], 13, 2, 3);
    expect(conservative.isAnomaly).toBe(true);
    expect(generous.isAnomaly).toBe(false);
  });

  it("stays silent until there is enough history to mean anything", () => {
    const r = checkDiscountAnomaly([2, 20], 25, 2, 3);
    expect(r.isAnomaly).toBe(false);
    expect(r.explanation).toContain("at least 3");
  });

  it("handles a perfectly consistent rep without dividing by zero", () => {
    const r = checkDiscountAnomaly([5, 5, 5, 5], 12, 2, 3);
    expect(r.stdDev).toBe(0);
    expect(r.isAnomaly).toBe(true);
    expect(r.explanation).toContain("perfectly consistent");
  });

  it("does not flag a consistent rep who repeats their usual number", () => {
    expect(checkDiscountAnomaly([5, 5, 5, 5], 5, 2, 3).isAnomaly).toBe(false);
  });

  it("is one-sided — discounting below your own average is not a risk", () => {
    expect(checkDiscountAnomaly([10, 12, 11, 13], 0, 2, 3).isAnomaly).toBe(false);
  });

  it("responds to a reconfigured sensitivity", () => {
    // mean 5.5, population stdDev ~1.118, so 8% sits at z ~2.24 — above a
    // 2-sigma threshold but below a 3-sigma one.
    const history = [4, 5, 6, 7];
    expect(checkDiscountAnomaly(history, 8, 3, 3).isAnomaly).toBe(false);
    expect(checkDiscountAnomaly(history, 8, 2, 3).isAnomaly).toBe(true);
  });
});

describe("delivery slippage", () => {
  it("flags a promised date that has already passed", () => {
    const r = checkDeliverySlippage(new Date("2026-01-20"), new Date("2026-01-27"));
    expect(r.isSlipping).toBe(true);
    expect(r.daysLate).toBe(7);
  });

  it("reports the remaining slack before the promised date", () => {
    const r = checkDeliverySlippage(new Date("2026-01-27"), new Date("2026-01-20"));
    expect(r.isSlipping).toBe(false);
    expect(r.daysLate).toBe(0);
  });

  // Guards the honesty of the wording: the system has no lead-time model, so the
  // explanation must not claim a fulfilment estimate it never computed.
  it("never claims a fulfilment forecast it did not compute", () => {
    const late = checkDeliverySlippage(new Date("2026-01-20"), new Date("2026-01-27"));
    const early = checkDeliverySlippage(new Date("2026-01-27"), new Date("2026-01-20"));
    for (const r of [late, early]) {
      expect(r.explanation.toLowerCase()).not.toContain("fulfilment");
      expect(r.explanation.toLowerCase()).not.toContain("lands");
    }
    expect(late.explanation).toContain("promised date has passed");
  });

  it("stays quiet when no promise was made", () => {
    expect(checkDeliverySlippage(null, new Date("2026-01-27")).isSlipping).toBe(false);
  });
});
