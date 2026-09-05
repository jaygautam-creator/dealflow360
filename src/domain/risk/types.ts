/** Inputs and outputs for the blended discount risk engine. */

export type CeilingSource = "TIER" | "CATEGORY" | "EQUAL";

/** One quotation line, reduced to only what risk scoring needs. */
export interface RiskLineInput {
  lineId: string;
  productName: string;
  categoryName: string;
  /** Discount ceiling for this product's category, in percentage points. */
  categoryCeilingPct: number;
  quantity: number;
  /** List price per unit, in paise, before any discount. */
  unitPricePaise: number;
  /** Discount the rep actually applied to this line, in percentage points. */
  discountPct: number;
}

export interface RiskInput {
  customerTier: string;
  /** Discount ceiling granted by the customer's tier, in percentage points. */
  tierCeilingPct: number;
  lines: readonly RiskLineInput[];
  /**
   * Multiplier applied to the aggregate signal. Read from RiskConfig, never hardcoded,
   * so the governance team can retune escalation without a code change.
   */
  aggregateAmplifier: number;
}

/** Per-line explanation of how the line contributed to the score. */
export interface RiskLineTrace {
  lineId: string;
  productName: string;
  categoryName: string;
  tierCeilingPct: number;
  categoryCeilingPct: number;
  /** The ceiling actually enforced: the stricter of the tier and category ceilings. */
  effectiveCeilingPct: number;
  /** Which of the two ceilings bound this line. Shown in the UI so the rep sees why. */
  ceilingSource: CeilingSource;
  discountPct: number;
  /** Percentage points above the effective ceiling. Zero when the line is compliant. */
  breachPts: number;
  isBreaching: boolean;
  /** Line value at list price, in paise, before discount. */
  grossValuePaise: number;
  /** This line's share of the order's list value, 0..1. Weights the aggregate signal. */
  valueWeight: number;
  /** Money given away beyond policy on this line, in paise. */
  giveawayPaise: number;
}

export interface RiskAssessment {
  /** The blended score, in percentage points. Zero means fully within policy. */
  score: number;
  /** Signal A — the worst single-line breach. Catches one badly discounted line. */
  severitySignal: number;
  /** Signal B — the value-weighted mean breach across the order. Catches many small ones. */
  aggregateSignal: number;
  /** Signal B after the configured amplifier is applied. */
  amplifiedAggregate: number;
  /** Which signal determined the final score. Drives the wording shown to approvers. */
  drivingSignal: "SEVERITY" | "AGGREGATE" | "NONE";
  breachingLineCount: number;
  /** Total money given away beyond policy across the order, in paise. */
  totalGiveawayPaise: number;
  /** Order value at list price, in paise. */
  orderGrossPaise: number;
  lines: RiskLineTrace[];
}
