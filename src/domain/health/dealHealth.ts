import { differenceInCalendarDays } from "../shared/dates";

/**
 * Deal health and anomaly detection
 * =================================
 *
 * A manager should not have to read every quotation to find the ones going wrong. These
 * detectors surface three failure modes that are invisible on a normal pipeline board.
 *
 * The discount detector deliberately compares a rep against *their own* history rather
 * than a company-wide average. A rep who habitually sells at 12% is not behaving oddly at
 * 13%; a rep who never exceeds 3% suddenly quoting 13% is. A fixed company threshold
 * cannot see that difference, so this uses a z-score against the rep's own distribution.
 */

export interface StalledCheck {
  isStalled: boolean;
  daysInactive: number;
  explanation: string;
}

/** A quotation with no meaningful activity for longer than the configured window. */
export function checkStalled(
  lastActivityAt: Date,
  now: Date,
  stalledAfterDays: number,
): StalledCheck {
  const daysInactive = differenceInCalendarDays(now, lastActivityAt);
  const isStalled = daysInactive >= stalledAfterDays;
  return {
    isStalled,
    daysInactive,
    explanation: isStalled
      ? `No activity for ${daysInactive} days, past the ${stalledAfterDays}-day threshold.`
      : `Last touched ${daysInactive} day(s) ago, within the ${stalledAfterDays}-day threshold.`,
  };
}

export interface AnomalyCheck {
  isAnomaly: boolean;
  zScore: number;
  mean: number;
  stdDev: number;
  sampleSize: number;
  explanation: string;
}

/**
 * Flags a discount that is unusual *for this rep*, using a z-score against their own
 * rolling history: z = (value - mean) / standard deviation.
 *
 * Two guards matter here. With too few past quotations the distribution is meaningless,
 * so detection is suppressed below a configured sample size rather than firing on noise.
 * And when a rep has always given exactly the same discount the standard deviation is
 * zero, which would divide by zero — that case is treated as "any deviation at all is
 * notable", which is both safe and correct.
 */
export function checkDiscountAnomaly(
  repHistoryPcts: readonly number[],
  currentDiscountPct: number,
  zThreshold: number,
  minSamples: number,
): AnomalyCheck {
  const n = repHistoryPcts.length;

  if (n < minSamples) {
    return {
      isAnomaly: false,
      zScore: 0,
      mean: 0,
      stdDev: 0,
      sampleSize: n,
      explanation: `Only ${n} past quotation(s) on record; at least ${minSamples} are needed before a deviation means anything.`,
    };
  }

  const mean = repHistoryPcts.reduce((a, b) => a + b, 0) / n;
  // Population standard deviation: this is the rep's complete history, not a sample of it.
  const variance = repHistoryPcts.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    const isAnomaly = currentDiscountPct !== mean;
    return {
      isAnomaly,
      zScore: isAnomaly ? Infinity : 0,
      mean,
      stdDev: 0,
      sampleSize: n,
      explanation: isAnomaly
        ? `This rep has given exactly ${mean}% on every previous quotation. ${currentDiscountPct}% is a departure from an otherwise perfectly consistent pattern.`
        : `Consistent with this rep's unbroken ${mean}% pattern.`,
    };
  }

  const zScore = (currentDiscountPct - mean) / stdDev;
  // One-sided: discounting far *below* your own average is not a governance risk.
  const isAnomaly = zScore >= zThreshold;

  return {
    isAnomaly,
    zScore: Math.round(zScore * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    sampleSize: n,
    explanation: isAnomaly
      ? `${currentDiscountPct}% is ${(Math.round(zScore * 100) / 100)} standard deviations above this rep's own average of ${Math.round(mean * 100) / 100}%.`
      : `${currentDiscountPct}% is in line with this rep's average of ${Math.round(mean * 100) / 100}%.`,
  };
}

export interface SlippageCheck {
  isSlipping: boolean;
  daysLate: number;
  explanation: string;
}

/** Compares the date promised to the customer against what fulfilment can actually meet. */
export function checkDeliverySlippage(
  promisedDate: Date | null,
  earliestFulfillableDate: Date | null,
): SlippageCheck {
  if (promisedDate === null || earliestFulfillableDate === null) {
    return { isSlipping: false, daysLate: 0, explanation: "No delivery promise recorded." };
  }
  const daysLate = differenceInCalendarDays(earliestFulfillableDate, promisedDate);
  return {
    isSlipping: daysLate > 0,
    daysLate: Math.max(daysLate, 0),
    explanation:
      daysLate > 0
        ? `Fulfilment lands ${daysLate} day(s) after the promised date.`
        : `Fulfilment meets the promised date with ${Math.abs(daysLate)} day(s) to spare.`,
  };
}
