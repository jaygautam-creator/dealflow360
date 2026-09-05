/**
 * Admissibility of a customer counter-offer.
 *
 * WHY THIS EXISTS:
 * The portal accepted any discount a customer typed. A request for 100% off was stored,
 * moved the deal into UNDER_NEGOTIATION, and sat on a rep's board as though it were a
 * real commercial position. It is not one — it is noise that costs a human a decision.
 *
 * WHY A CONSTANT AND NOT A TABLE:
 * Everything a *business* tunes in this system lives in a table — tier ceilings, category
 * ceilings, approval bands, risk weights. This is a different kind of number. Tier and
 * category ceilings are commercial policy: what the business is willing to give away.
 * This is an input bound: what counts as a serious offer at all. A customer asking for
 * more than the deepest ceiling in the system (15%) is negotiating; a customer asking for
 * double it is not making an offer the workflow can act on. Moving this into a table
 * would invite someone to set it to 90 and quietly re-open the hole it closes.
 *
 * Deliberately NOT the customer's own tier ceiling: a Bronze customer whose ceiling is 5%
 * is still entitled to ASK for 12% and have a human consider it. Capping the request at
 * the ceiling would delete the negotiation this whole feature exists to support.
 */

/** The most a customer may request. Roughly double the deepest ceiling the business sets. */
export const MAX_REQUESTABLE_DISCOUNT_PCT = 30;

export type CounterOfferVerdict =
  | { admissible: true }
  | { admissible: false; reason: string };

/**
 * Screens a requested discount before it becomes a negotiation.
 *
 * Returns a verdict with its reasoning rather than a boolean, so the refusal can be shown
 * to the customer and written to the audit trail in the same words.
 */
export function screenCounterOffer(
  requestedPct: number,
  maxPct: number = MAX_REQUESTABLE_DISCOUNT_PCT,
): CounterOfferVerdict {
  if (!Number.isFinite(requestedPct)) {
    return { admissible: false, reason: "The requested discount is not a number." };
  }
  if (requestedPct <= 0) {
    return {
      admissible: false,
      reason: "A counter-offer has to ask for a discount greater than 0%.",
    };
  }
  if (requestedPct > maxPct) {
    return {
      admissible: false,
      reason:
        `A discount of ${requestedPct}% is beyond what can be considered. ` +
        `Requests are capped at ${maxPct}%. Ask for ${maxPct}% or less, ` +
        `or contact your account manager to discuss the order as a whole.`,
    };
  }
  return { admissible: true };
}
