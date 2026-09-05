import { describe, it, expect } from "vitest";
import { rankSuggestions, marginPct, netLineTotal, type UpsellCandidate } from "./recommend";
import { toPaise } from "../shared/money";

function candidate(over: Partial<UpsellCandidate> = {}): UpsellCandidate {
  return {
    ruleId: "r1",
    productId: "p1",
    productName: "Extended Warranty",
    categoryName: "Service",
    listPricePaise: toPaise(10_000),
    costPaise: toPaise(4_000), // 60% margin
    isPromoted: false,
    coPurchaseScore: 50,
    minMarginPct: 0,
    ...over,
  };
}

const ORDER_REVENUE = toPaise(100_000);
const ORDER_COST = toPaise(70_000); // order sits at 30% margin

describe("upsell ranking", () => {
  it("ranks a more frequently co-purchased product higher", () => {
    const out = rankSuggestions(
      [
        candidate({ ruleId: "low", productId: "a", coPurchaseScore: 10 }),
        candidate({ ruleId: "high", productId: "b", coPurchaseScore: 90 }),
      ],
      [], ORDER_REVENUE, ORDER_COST,
    );
    expect(out[0].ruleId).toBe("high");
  });

  it("boosts a promoted product above an equally correlated one", () => {
    const out = rankSuggestions(
      [
        candidate({ ruleId: "plain", productId: "a", coPurchaseScore: 50, isPromoted: false }),
        candidate({ ruleId: "promo", productId: "b", coPurchaseScore: 50, isPromoted: true }),
      ],
      [], ORDER_REVENUE, ORDER_COST,
    );
    expect(out[0].ruleId).toBe("promo");
    expect(out[0].reason).toContain("currently promoted");
  });

  it("never suggests something already in the cart", () => {
    const out = rankSuggestions([candidate({ productId: "already" })], ["already"], ORDER_REVENUE, ORDER_COST);
    expect(out).toEqual([]);
  });

  it("suppresses a suggestion that would breach its own margin floor", () => {
    const thin = candidate({
      productId: "thin",
      listPricePaise: toPaise(10_000),
      costPaise: toPaise(9_500), // 5% margin
      minMarginPct: 20,
    });
    expect(rankSuggestions([thin], [], ORDER_REVENUE, ORDER_COST)).toEqual([]);
  });

  it("keeps a suggestion that sits exactly on its margin floor", () => {
    const exact = candidate({ listPricePaise: toPaise(10_000), costPaise: toPaise(8_000), minMarginPct: 20 });
    expect(rankSuggestions([exact], [], ORDER_REVENUE, ORDER_COST)).toHaveLength(1);
  });

  it("reports the margin impact of adding the line, so the rep sees it before clicking", () => {
    // A 60%-margin add-on lifts a 30%-margin order.
    const out = rankSuggestions([candidate()], [], ORDER_REVENUE, ORDER_COST);
    expect(out[0].productMarginPct).toBe(60);
    expect(out[0].marginDeltaPct).toBeGreaterThan(0);
  });

  it("reports a negative delta when the add-on would dilute order margin", () => {
    const dilutive = candidate({ listPricePaise: toPaise(50_000), costPaise: toPaise(45_000) }); // 10% margin
    const out = rankSuggestions([dilutive], [], ORDER_REVENUE, ORDER_COST);
    expect(out[0].marginDeltaPct).toBeLessThan(0);
  });

  it("returns nothing when there are no candidates", () => {
    expect(rankSuggestions([], [], ORDER_REVENUE, ORDER_COST)).toEqual([]);
  });
});

describe("margin and line arithmetic", () => {
  it("computes gross margin as a share of revenue", () => {
    expect(marginPct(toPaise(100), toPaise(60))).toBeCloseTo(40, 5);
  });

  it("returns zero rather than NaN on a zero-revenue order", () => {
    expect(marginPct(0, 0)).toBe(0);
  });

  it("reports a negative margin when cost exceeds revenue", () => {
    expect(marginPct(toPaise(100), toPaise(150))).toBeCloseTo(-50, 5);
  });

  it("applies a line discount in whole paise", () => {
    expect(netLineTotal(toPaise(1_000), 3, 10)).toBe(toPaise(2_700));
  });

  it("leaves an undiscounted line untouched", () => {
    expect(netLineTotal(toPaise(1_000), 3, 0)).toBe(toPaise(3_000));
  });

  it("rounds a discount that does not divide evenly, without drifting into floats", () => {
    // 3 x 333.33 = 999.99 -> 99999 paise; 7% of that is 6999.93 -> 7000 paise.
    const net = netLineTotal(toPaise(333.33), 3, 7);
    expect(Number.isInteger(net)).toBe(true);
    expect(net).toBe(99_999 - 7_000);
  });
});
