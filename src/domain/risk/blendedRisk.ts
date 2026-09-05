import { applyPct, roundPct, safeRatio, sumPaise } from "../shared/money";
import type { RiskAssessment, RiskInput, RiskLineTrace, CeilingSource } from "./types";

/**
 * Blended Discount Risk Score
 * ===========================
 *
 * The problem this solves: a single order-level discount limit is not enough. A Gold
 * customer may be entitled to 15%, but a thin-margin Services line may only tolerate 10%.
 * So every line is checked against its *own* ceiling, and the order is then judged on two
 * independent signals rather than one number.
 *
 *   Signal A — Severity  : the worst single-line breach.
 *                          Catches "one line is badly out of line".
 *
 *   Signal B — Aggregate : the value-weighted mean breach across the whole order.
 *                          Catches "no single line looks alarming, but the rep has quietly
 *                          given away a lot of margin across many lines".
 *
 * The final score is `max(A, B x amplifier)`. Taking the maximum rather than the sum keeps
 * the score in the same unit as both signals — percentage points over ceiling — so an
 * approval band like "escalate above 5" stays readable to a human. The amplifier decides
 * how aggressively the spread-out case escalates relative to the single-bad-line case;
 * it is configuration (RiskConfig.aggregateAmplifier), not a constant in this file.
 *
 * Weighting the aggregate by line value is deliberate: 8 points over on a line worth
 * 2% of the order is not the same business risk as 8 points over on a line worth 60%.
 *
 * The function is pure and total — no I/O, no clock, no randomness — so the same
 * quotation always produces the same score, and every case below is unit-testable.
 */
export function assessBlendedRisk(input: RiskInput): RiskAssessment {
  const { tierCeilingPct, lines, aggregateAmplifier } = input;

  // Pass 1: establish each line's list value, so we can weight by value in pass 2.
  const grossByLine = lines.map((line) => line.unitPricePaise * line.quantity);
  const orderGrossPaise = sumPaise(grossByLine);

  // Pass 2: enforce the stricter of the two ceilings on every line.
  const traces: RiskLineTrace[] = lines.map((line, i) => {
    const grossValuePaise = grossByLine[i];

    // The stricter ceiling always wins. A generous tier cannot unlock a discount that
    // the product category itself does not tolerate.
    const effectiveCeilingPct = Math.min(tierCeilingPct, line.categoryCeilingPct);

    let ceilingSource: CeilingSource;
    if (tierCeilingPct === line.categoryCeilingPct) ceilingSource = "EQUAL";
    else if (effectiveCeilingPct === line.categoryCeilingPct) ceilingSource = "CATEGORY";
    else ceilingSource = "TIER";

    // Breach is measured in percentage points above the ceiling, never below zero:
    // discounting *under* the ceiling earns no credit to offset another line's breach.
    const breachPts = roundPct(Math.max(0, line.discountPct - effectiveCeilingPct));

    return {
      lineId: line.lineId,
      productName: line.productName,
      categoryName: line.categoryName,
      tierCeilingPct,
      categoryCeilingPct: line.categoryCeilingPct,
      effectiveCeilingPct,
      ceilingSource,
      discountPct: line.discountPct,
      breachPts,
      isBreaching: breachPts > 0,
      grossValuePaise,
      valueWeight: safeRatio(grossValuePaise, orderGrossPaise),
      // Money handed over beyond what policy allowed, rounded to whole paise here so
      // the total below is an exact integer sum rather than an accumulation of floats.
      giveawayPaise: applyPct(grossValuePaise, breachPts),
    };
  });

  // Signal A: the single worst offender.
  const severitySignal = traces.reduce((worst, t) => Math.max(worst, t.breachPts), 0);

  // Signal B: value-weighted mean breach. Equivalent to (total giveaway / order value),
  // expressed in percentage points, which is why small breaches on large lines still count.
  const aggregateSignal = roundPct(
    traces.reduce((sum, t) => sum + t.breachPts * t.valueWeight, 0),
  );

  const amplifiedAggregate = roundPct(aggregateSignal * aggregateAmplifier);
  const score = roundPct(Math.max(severitySignal, amplifiedAggregate));

  let drivingSignal: RiskAssessment["drivingSignal"];
  if (score === 0) drivingSignal = "NONE";
  else if (amplifiedAggregate > severitySignal) drivingSignal = "AGGREGATE";
  else drivingSignal = "SEVERITY";

  return {
    score,
    severitySignal,
    aggregateSignal,
    amplifiedAggregate,
    drivingSignal,
    breachingLineCount: traces.filter((t) => t.isBreaching).length,
    totalGiveawayPaise: sumPaise(traces.map((t) => t.giveawayPaise)),
    orderGrossPaise,
    lines: traces,
  };
}

/**
 * A one-sentence, human-readable reason for the score, shown at the top of the approval
 * screen. Approvers should never have to read a number and guess what it meant.
 */
export function explainRisk(a: RiskAssessment): string {
  if (a.drivingSignal === "NONE") {
    return "Every line is within its discount ceiling. No approval required.";
  }
  if (a.drivingSignal === "SEVERITY") {
    const worst = a.lines.reduce((w, l) => (l.breachPts > w.breachPts ? l : w), a.lines[0]);
    return `Driven by a single line: "${worst.productName}" is ${worst.breachPts} points over its ${worst.effectiveCeilingPct}% ceiling (set by ${worst.ceilingSource === "CATEGORY" ? "its category" : "the customer tier"}).`;
  }
  return `Driven by spread: ${a.breachingLineCount} lines are individually over their ceilings, together giving away ${a.aggregateSignal} points of order value beyond policy.`;
}
