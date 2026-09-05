import { describe, expect, it } from "vitest";
import {
  MAX_REQUESTABLE_DISCOUNT_PCT,
  screenCounterOffer,
} from "./counterOffer";

describe("screenCounterOffer", () => {
  it("admits a request inside the cap", () => {
    expect(screenCounterOffer(20)).toEqual({ admissible: true });
  });

  it("admits a request sitting exactly on the cap", () => {
    expect(screenCounterOffer(MAX_REQUESTABLE_DISCOUNT_PCT).admissible).toBe(true);
  });

  it("refuses a request one step over the cap", () => {
    const verdict = screenCounterOffer(MAX_REQUESTABLE_DISCOUNT_PCT + 0.01);
    expect(verdict.admissible).toBe(false);
  });

  it("refuses the absurd asks the portal used to accept", () => {
    for (const pct of [35, 40, 50, 99, 100]) {
      expect(screenCounterOffer(pct).admissible).toBe(false);
    }
  });

  it("states the cap in the refusal so the customer can act on it", () => {
    const verdict = screenCounterOffer(50);
    expect(verdict.admissible).toBe(false);
    if (!verdict.admissible) {
      expect(verdict.reason).toContain("50%");
      expect(verdict.reason).toContain(`${MAX_REQUESTABLE_DISCOUNT_PCT}%`);
    }
  });

  it("refuses zero and negative asks, which are not offers", () => {
    expect(screenCounterOffer(0).admissible).toBe(false);
    expect(screenCounterOffer(-10).admissible).toBe(false);
  });

  it("refuses NaN and Infinity rather than letting them reach the database", () => {
    expect(screenCounterOffer(Number.NaN).admissible).toBe(false);
    expect(screenCounterOffer(Number.POSITIVE_INFINITY).admissible).toBe(false);
  });

  it("keeps the 20% counter the demo flow depends on admissible", () => {
    expect(screenCounterOffer(20).admissible).toBe(true);
  });

  it("accepts a caller-supplied cap, so the rule is testable without editing it", () => {
    expect(screenCounterOffer(25, 10).admissible).toBe(false);
    expect(screenCounterOffer(8, 10).admissible).toBe(true);
  });
});
