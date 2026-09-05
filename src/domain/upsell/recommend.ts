import { applyPct, safeRatio } from "../shared/money";

/**
 * Upsell and cross-sell recommendations
 * =====================================
 *
 * Suggestions are ranked by how often the products were actually bought together, with a
 * boost for anything currently promoted. Critically, a suggestion is suppressed when
 * adding it would drag the line margin below the rule's floor — the panel is there to
 * grow the deal, not to help a rep discount their way into a worse one.
 *
 * Each surviving suggestion carries the margin delta it would cause, so the rep sees the
 * consequence before clicking rather than after.
 */

export interface UpsellCandidate {
  ruleId: string;
  productId: string;
  productName: string;
  categoryName: string;
  listPricePaise: number;
  costPaise: number;
  isPromoted: boolean;
  coPurchaseScore: number;
  minMarginPct: number;
}

export interface Suggestion {
  ruleId: string;
  productId: string;
  productName: string;
  listPricePaise: number;
  /** Margin this product alone would carry at list price. */
  productMarginPct: number;
  /** Change to the whole order's margin if this line is added, in percentage points. */
  marginDeltaPct: number;
  isPromoted: boolean;
  rankScore: number;
  reason: string;
}

/** Promoted products are ranked above equally-correlated unpromoted ones. */
const PROMOTION_BOOST = 1.25;

export function rankSuggestions(
  candidates: readonly UpsellCandidate[],
  productIdsAlreadyInCart: readonly string[],
  orderRevenuePaise: number,
  orderCostPaise: number,
): Suggestion[] {
  const inCart = new Set(productIdsAlreadyInCart);
  const currentMarginPct = marginPct(orderRevenuePaise, orderCostPaise);

  return candidates
    .filter((c) => !inCart.has(c.productId))
    .map((c) => {
      const productMarginPct = marginPct(c.listPricePaise, c.costPaise);
      const newMarginPct = marginPct(
        orderRevenuePaise + c.listPricePaise,
        orderCostPaise + c.costPaise,
      );
      const marginDeltaPct = round2(newMarginPct - currentMarginPct);
      const rankScore = round2(c.coPurchaseScore * (c.isPromoted ? PROMOTION_BOOST : 1));

      return {
        ruleId: c.ruleId,
        productId: c.productId,
        productName: c.productName,
        listPricePaise: c.listPricePaise,
        productMarginPct: round2(productMarginPct),
        marginDeltaPct,
        isPromoted: c.isPromoted,
        rankScore,
        reason: c.isPromoted
          ? `Frequently bought together (score ${c.coPurchaseScore}) and currently promoted.`
          : `Frequently bought together (score ${c.coPurchaseScore}).`,
        _minMarginPct: c.minMarginPct,
        _productMarginPct: productMarginPct,
      };
    })
    // A suggestion that would breach its own margin floor is never shown.
    .filter((s) => s._productMarginPct >= s._minMarginPct)
    .map(({ _minMarginPct, _productMarginPct, ...s }) => s)
    .sort((a, b) => b.rankScore - a.rankScore || b.marginDeltaPct - a.marginDeltaPct);
}

/** Gross margin as a percentage of revenue. Zero revenue yields zero, never NaN. */
export function marginPct(revenuePaise: number, costPaise: number): number {
  return safeRatio(revenuePaise - costPaise, revenuePaise) * 100;
}

/** Net line total in paise after a percentage discount, rounded to whole paise. */
export function netLineTotal(
  unitPricePaise: number,
  quantity: number,
  discountPct: number,
): number {
  const gross = unitPricePaise * quantity;
  return gross - applyPct(gross, discountPct);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
