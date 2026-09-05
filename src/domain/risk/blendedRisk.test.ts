import { describe, it, expect } from "vitest";
import { assessBlendedRisk, explainRisk } from "./blendedRisk";
import { toPaise } from "../shared/money";
import type { RiskInput, RiskLineInput } from "./types";

const GOLD_CEILING = 15;
const HARDWARE_CEILING = 15;
const SERVICE_CEILING = 10;

function line(over: Partial<RiskLineInput> = {}): RiskLineInput {
  return {
    lineId: "L1",
    productName: "Laptop",
    categoryName: "Hardware",
    categoryCeilingPct: HARDWARE_CEILING,
    quantity: 1,
    unitPricePaise: toPaise(100_000),
    discountPct: 0,
    ...over,
  };
}

function input(lines: RiskLineInput[], over: Partial<RiskInput> = {}): RiskInput {
  return {
    customerTier: "GOLD",
    tierCeilingPct: GOLD_CEILING,
    lines,
    aggregateAmplifier: 1.5,
    ...over,
  };
}

describe("blended discount risk — compliant orders", () => {
  it("scores zero when no discount is applied", () => {
    const a = assessBlendedRisk(input([line()]));
    expect(a.score).toBe(0);
    expect(a.drivingSignal).toBe("NONE");
    expect(a.breachingLineCount).toBe(0);
    expect(a.totalGiveawayPaise).toBe(0);
  });

  it("scores zero when every line sits exactly on its ceiling", () => {
    const a = assessBlendedRisk(
      input([
        line({ lineId: "L1", discountPct: 15 }),
        line({ lineId: "L2", productName: "Setup", categoryName: "Service", categoryCeilingPct: SERVICE_CEILING, discountPct: 10 }),
      ]),
    );
    expect(a.score).toBe(0);
    expect(a.breachingLineCount).toBe(0);
  });

  it("gives no credit for discounting below the ceiling", () => {
    // A deeply-compliant line must not offset a breaching one.
    const a = assessBlendedRisk(
      input([
        line({ lineId: "L1", discountPct: 0 }),
        line({ lineId: "L2", productName: "Setup", categoryName: "Service", categoryCeilingPct: SERVICE_CEILING, discountPct: 18 }),
      ]),
    );
    expect(a.severitySignal).toBe(8);
    expect(a.score).toBeGreaterThan(0);
  });
});

describe("blended discount risk — the worked example from the problem statement", () => {
  // Gold customer (15% tier ceiling). Hardware allows 15%, Service allows only 10%.
  // Laptop discounted 12% -> compliant. Setup Service discounted 18% -> 8 points over.
  // Expected: the whole quotation is flagged because of that one line.
  const assessment = assessBlendedRisk(
    input([
      line({ lineId: "HW", productName: "Laptop", discountPct: 12 }),
      line({
        lineId: "SV",
        productName: "Setup Service",
        categoryName: "Service",
        categoryCeilingPct: SERVICE_CEILING,
        discountPct: 18,
        unitPricePaise: toPaise(20_000),
      }),
    ]),
  );

  it("leaves the hardware line compliant", () => {
    const hw = assessment.lines.find((l) => l.lineId === "HW")!;
    expect(hw.effectiveCeilingPct).toBe(15);
    expect(hw.breachPts).toBe(0);
    expect(hw.isBreaching).toBe(false);
  });

  it("flags the service line as exactly 8 points over its own stricter ceiling", () => {
    const sv = assessment.lines.find((l) => l.lineId === "SV")!;
    expect(sv.effectiveCeilingPct).toBe(10);
    expect(sv.ceilingSource).toBe("CATEGORY");
    expect(sv.breachPts).toBe(8);
  });

  it("flags the whole quotation, driven by that single line", () => {
    expect(assessment.score).toBe(8);
    expect(assessment.severitySignal).toBe(8);
    expect(assessment.drivingSignal).toBe("SEVERITY");
    expect(explainRisk(assessment)).toContain("Setup Service");
  });

  it("reports the money given away beyond policy", () => {
    // 8% of the 20,000 service line = 1,600 rupees = 160,000 paise.
    expect(assessment.totalGiveawayPaise).toBe(toPaise(1_600));
  });
});

describe("blended discount risk — death by a thousand cuts", () => {
  // Three equally-sized lines, each only 2-3 points over. No single line looks alarming,
  // but together the rep has given away real margin. The aggregate signal must escalate.
  const lines = [
    line({ lineId: "A", categoryCeilingPct: 10, discountPct: 12 }), // 2 over
    line({ lineId: "B", categoryCeilingPct: 10, discountPct: 13 }), // 3 over
    line({ lineId: "C", categoryCeilingPct: 10, discountPct: 12 }), // 2 over
  ];

  it("escalates above the worst single line", () => {
    const a = assessBlendedRisk(input(lines));
    expect(a.severitySignal).toBe(3);
    // Value-weighted mean breach = (2 + 3 + 2) / 3 = 2.33
    expect(a.aggregateSignal).toBeCloseTo(2.33, 2);
    // Amplified: 2.33 x 1.5 = 3.5, which now exceeds the worst single line.
    expect(a.amplifiedAggregate).toBeCloseTo(3.5, 1);
    expect(a.drivingSignal).toBe("AGGREGATE");
    expect(a.score).toBeGreaterThan(a.severitySignal);
  });

  it("names spread, not a single product, as the reason", () => {
    const a = assessBlendedRisk(input(lines));
    expect(explainRisk(a)).toContain("3 lines");
  });
});

describe("blended discount risk — value weighting", () => {
  it("treats a breach on a large line as more serious than the same breach on a small one", () => {
    const bigLineBreaches = assessBlendedRisk(
      input([
        line({ lineId: "BIG", categoryCeilingPct: 10, discountPct: 15, unitPricePaise: toPaise(900_000) }),
        line({ lineId: "SMALL", categoryCeilingPct: 10, discountPct: 10, unitPricePaise: toPaise(100_000) }),
      ]),
    );
    const smallLineBreaches = assessBlendedRisk(
      input([
        line({ lineId: "BIG", categoryCeilingPct: 10, discountPct: 10, unitPricePaise: toPaise(900_000) }),
        line({ lineId: "SMALL", categoryCeilingPct: 10, discountPct: 15, unitPricePaise: toPaise(100_000) }),
      ]),
    );
    // Identical 5-point breach in both, but on 90% vs 10% of order value.
    expect(bigLineBreaches.severitySignal).toBe(smallLineBreaches.severitySignal);
    expect(bigLineBreaches.aggregateSignal).toBeGreaterThan(smallLineBreaches.aggregateSignal);
    expect(bigLineBreaches.totalGiveawayPaise).toBeGreaterThan(smallLineBreaches.totalGiveawayPaise);
  });
});

describe("blended discount risk — ceiling resolution", () => {
  it("uses the tier ceiling when it is stricter than the category ceiling", () => {
    const a = assessBlendedRisk(
      input([line({ categoryCeilingPct: 20, discountPct: 18 })], { tierCeilingPct: 5, customerTier: "BRONZE" }),
    );
    expect(a.lines[0].effectiveCeilingPct).toBe(5);
    expect(a.lines[0].ceilingSource).toBe("TIER");
    expect(a.lines[0].breachPts).toBe(13);
  });

  it("uses the category ceiling when it is stricter than the tier ceiling", () => {
    const a = assessBlendedRisk(input([line({ categoryCeilingPct: 5, discountPct: 8 })]));
    expect(a.lines[0].effectiveCeilingPct).toBe(5);
    expect(a.lines[0].ceilingSource).toBe("CATEGORY");
    expect(a.lines[0].breachPts).toBe(3);
  });

  it("reports EQUAL when both ceilings agree", () => {
    const a = assessBlendedRisk(input([line({ categoryCeilingPct: 15, discountPct: 15 })]));
    expect(a.lines[0].ceilingSource).toBe("EQUAL");
  });
});

describe("blended discount risk — configuration and edge cases", () => {
  it("responds to the configured amplifier rather than a hardcoded constant", () => {
    const lines = [
      line({ lineId: "A", categoryCeilingPct: 10, discountPct: 12 }),
      line({ lineId: "B", categoryCeilingPct: 10, discountPct: 12 }),
    ];
    const lenient = assessBlendedRisk(input(lines, { aggregateAmplifier: 1.0 }));
    const strict = assessBlendedRisk(input(lines, { aggregateAmplifier: 3.0 }));
    expect(strict.score).toBeGreaterThan(lenient.score);
    // With no amplification the aggregate cannot exceed the worst line, so severity wins.
    expect(lenient.drivingSignal).toBe("SEVERITY");
    expect(strict.drivingSignal).toBe("AGGREGATE");
  });

  it("handles an empty quotation without dividing by zero", () => {
    const a = assessBlendedRisk(input([]));
    expect(a.score).toBe(0);
    expect(a.orderGrossPaise).toBe(0);
    expect(a.lines).toEqual([]);
  });

  it("handles a zero-value order without dividing by zero", () => {
    const a = assessBlendedRisk(input([line({ unitPricePaise: 0, discountPct: 50 })]));
    expect(a.orderGrossPaise).toBe(0);
    expect(a.lines[0].valueWeight).toBe(0);
    // The line still breaches on severity even though it carries no value.
    expect(a.severitySignal).toBe(35);
    expect(a.score).toBe(35);
  });

  it("is deterministic — the same input always yields the same score", () => {
    const i = input([line({ categoryCeilingPct: 10, discountPct: 17 })]);
    expect(assessBlendedRisk(i)).toEqual(assessBlendedRisk(i));
  });
});
