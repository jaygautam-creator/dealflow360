import { daysInMonth } from "../shared/dates";
import { applyPct, roundPct, safeRatio, sumPaise } from "../shared/money";

/**
 * Month-end promotion
 * ===================
 *
 * A deal closed in the closing days of a month is worth more to the business than the
 * same deal closed a week later: it lands in this month's numbers. So the business is
 * willing to pay a little for it — either a few extra discount points, or an accessory
 * thrown in.
 *
 * THE GOVERNANCE PROBLEM THIS HAS TO SOLVE:
 * A promotion is the classic way discount policy gets quietly bypassed. "It's a
 * promotion" is how a 40% line ends up shipped without ever meeting an approver. So the
 * bonus here is *clamped by the same category ceiling the risk engine polices*: a line
 * already sitting at its category maximum receives zero bonus, and the trace says so out
 * loud. The promotion cannot create a discount that governance has not already agreed to.
 * It can still push a line's discount up, which re-scores the quotation and may route it
 * for approval exactly like any other discount change — that is the point, not a flaw.
 *
 * A GIFT IS NOT A DISCOUNT:
 * The gift is drawn from products the business has already configured as cross-sell
 * accessories (UpsellRule suggestions), never from arbitrary stock, and it is capped as a
 * fraction of order value so a small order cannot walk away with an expensive item.
 *
 * Pure. No clock, no database, no randomness — `today` is passed in, which is also what
 * makes "is the 29th inside the window in February" a test rather than a hope.
 */

/** Tunables. Passed in so the caller decides policy and every branch is testable. */
export interface MonthEndPolicy {
  /** How many days before the end of the month the window opens. 7 covers the 25th on. */
  windowDays: number;
  /** Extra discount points offered inside the window, before the ceiling clamp. */
  bonusDiscountPct: number;
  /** A gift may not exceed this share of order value. Keeps small orders honest. */
  maxGiftShareOfOrderPct: number;
}

export const DEFAULT_MONTH_END_POLICY: MonthEndPolicy = {
  windowDays: 7,
  bonusDiscountPct: 3,
  maxGiftShareOfOrderPct: 5,
};

export interface MonthEndLineInput {
  lineId: string;
  productName: string;
  categoryName: string;
  /** Discount already on the line, in percentage points. */
  currentDiscountPct: number;
  /** The line's category ceiling — the same figure the risk engine scores against. */
  categoryMaxDiscountPct: number;
  /** Line value before discount, in paise. */
  grossPaise: number;
}

export interface GiftCandidate {
  productId: string;
  productName: string;
  categoryName: string;
  listPricePaise: number;
}

export interface LineBonus {
  lineId: string;
  productName: string;
  currentDiscountPct: number;
  /** Bonus actually granted after the ceiling clamp. May be 0. */
  bonusPct: number;
  resultingDiscountPct: number;
  /** What the customer saves from this bonus, in paise. */
  savingPaise: number;
  /** Why this line got what it got. Rendered next to the line. */
  reason: string;
}

export interface MonthEndGift {
  productId: string;
  productName: string;
  listPricePaise: number;
  reason: string;
}

export type MonthEndOffer =
  | { eligible: false; daysToMonthEnd: number; reason: string }
  | {
      eligible: true;
      daysToMonthEnd: number;
      lineBonuses: LineBonus[];
      totalSavingPaise: number;
      gift: MonthEndGift | null;
      reason: string;
    };

/**
 * Days remaining in `today`'s calendar month, counting today as 0 on the last day.
 * UTC throughout, for the same reason the rest of the date maths is: a promotion must
 * not open or close a day early because of a timezone offset.
 */
export function daysToMonthEnd(today: Date): number {
  const last = daysInMonth(today.getUTCFullYear(), today.getUTCMonth());
  return last - today.getUTCDate();
}

/** Is `today` inside the month-end window? */
export function isMonthEndWindow(today: Date, policy: MonthEndPolicy): boolean {
  return daysToMonthEnd(today) < policy.windowDays;
}

export function evaluateMonthEndOffer(
  today: Date,
  lines: readonly MonthEndLineInput[],
  giftCandidates: readonly GiftCandidate[],
  policy: MonthEndPolicy = DEFAULT_MONTH_END_POLICY,
): MonthEndOffer {
  const remaining = daysToMonthEnd(today);

  if (!isMonthEndWindow(today, policy)) {
    return {
      eligible: false,
      daysToMonthEnd: remaining,
      reason: `Month-end offers open in the last ${policy.windowDays} days of the month. ${remaining} days remain.`,
    };
  }

  if (lines.length === 0) {
    return {
      eligible: false,
      daysToMonthEnd: remaining,
      reason: "There are no lines on this quotation to apply an offer to.",
    };
  }

  const lineBonuses: LineBonus[] = lines.map((line) => {
    // The clamp. Headroom is whatever the category ceiling still allows on this line.
    const headroom = Math.max(0, line.categoryMaxDiscountPct - line.currentDiscountPct);
    const bonusPct = roundPct(Math.min(policy.bonusDiscountPct, headroom));
    const resultingDiscountPct = roundPct(line.currentDiscountPct + bonusPct);

    return {
      lineId: line.lineId,
      productName: line.productName,
      currentDiscountPct: line.currentDiscountPct,
      bonusPct,
      resultingDiscountPct,
      savingPaise: applyPct(line.grossPaise, bonusPct),
      reason:
        bonusPct === 0
          ? `No bonus: already at the ${line.categoryName} ceiling of ${line.categoryMaxDiscountPct}%.`
          : bonusPct < policy.bonusDiscountPct
            ? `Bonus trimmed from ${policy.bonusDiscountPct}% to ${bonusPct}% to stay inside the ${line.categoryName} ceiling of ${line.categoryMaxDiscountPct}%.`
            : `Full ${bonusPct}% month-end bonus; still inside the ${line.categoryName} ceiling of ${line.categoryMaxDiscountPct}%.`,
    };
  });

  const totalSavingPaise = sumPaise(lineBonuses.map((b) => b.savingPaise));
  const orderGrossPaise = sumPaise(lines.map((l) => l.grossPaise));
  const gift = pickGift(orderGrossPaise, giftCandidates, policy);

  const grantedCount = lineBonuses.filter((b) => b.bonusPct > 0).length;
  const headline =
    grantedCount === 0
      ? "Every line is already at its category ceiling, so no extra discount is available."
      : `${grantedCount} of ${lines.length} line${lines.length === 1 ? "" : "s"} can take a month-end bonus.`;

  return {
    eligible: true,
    daysToMonthEnd: remaining,
    lineBonuses,
    totalSavingPaise,
    gift,
    reason:
      `${remaining === 0 ? "Last day of the month" : `${remaining} day${remaining === 1 ? "" : "s"} to month end`}. ` +
      headline +
      (gift ? ` A ${gift.productName} is included.` : ""),
  };
}

/**
 * The most valuable accessory the order can carry without the gift becoming the deal.
 *
 * Most valuable rather than cheapest: within a budget the business has already agreed to,
 * the better gift closes the deal, and picking the cheapest eligible item would make the
 * promotion feel like an insult on a large order.
 */
function pickGift(
  orderGrossPaise: number,
  candidates: readonly GiftCandidate[],
  policy: MonthEndPolicy,
): MonthEndGift | null {
  if (orderGrossPaise <= 0 || candidates.length === 0) return null;

  const budgetPaise = applyPct(orderGrossPaise, policy.maxGiftShareOfOrderPct);
  const affordable = candidates.filter((c) => c.listPricePaise > 0 && c.listPricePaise <= budgetPaise);
  if (affordable.length === 0) return null;

  const best = affordable.reduce((a, b) => (b.listPricePaise > a.listPricePaise ? b : a));
  const sharePct = roundPct(safeRatio(best.listPricePaise, orderGrossPaise) * 100);

  return {
    productId: best.productId,
    productName: best.productName,
    listPricePaise: best.listPricePaise,
    reason:
      `Included free: ${best.productName} (${best.categoryName}), ` +
      `${sharePct}% of order value, inside the ${policy.maxGiftShareOfOrderPct}% gift budget.`,
  };
}
