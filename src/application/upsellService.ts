import "server-only";
import { prisma } from "@/infrastructure/db";
import { scopedQuotationWhere } from "@/application/queries";
import type { SessionUser } from "@/infrastructure/auth/session";
import { dbToPaise, dbToPct } from "@/infrastructure/money";
import {
  rankSuggestions,
  netLineTotal,
  DEFAULT_PROMOTION_BOOST,
  type UpsellCandidate,
} from "@/domain/upsell/recommend";

/**
 * Upsell suggestions for a quotation in progress.
 *
 * Candidates are drawn from the rules attached to whatever is already in the cart, then
 * ranked and margin-filtered by the domain engine. The margin delta is computed against
 * the quotation's *current* revenue and cost, so the number the rep sees is the real
 * consequence of adding that line to this specific deal — not a generic product statistic.
 */
export async function suggestionsFor(user: SessionUser, quotationId: string) {
  // Scoped, not trusted. This used to take an id alone and findUniqueOrThrow it, which
  // made it correct only because its single caller happened to have already scoped the
  // read. That is precisely the arrangement scopedQuotationWhere exists to remove: a
  // filter cannot be forgotten at a call site, a convention can. Suggestions expose
  // product costs and margins, so a foreign id must return nothing rather than a list.
  const quotation = await prisma.quotation.findFirst({
    where: { AND: [{ id: quotationId }, scopedQuotationWhere(user)] },
    include: { lines: { include: { product: true, variant: true } } },
  });

  if (!quotation || quotation.lines.length === 0) return [];

  const cartProductIds = quotation.lines.map((l) => l.productId);

  const rules = await prisma.upsellRule.findMany({
    where: { triggerProductId: { in: cartProductIds } },
    include: { suggestedProduct: { include: { category: true } } },
  });

  // Current revenue and cost of the quotation, in paise.
  let revenuePaise = 0;
  let costPaise = 0;
  for (const line of quotation.lines) {
    const unit = dbToPaise(line.unitPrice) + dbToPaise(line.variant?.extraPrice ?? 0);
    revenuePaise += netLineTotal(unit, line.quantity, dbToPct(line.discountPct));
    costPaise += dbToPaise(line.unitCost) * line.quantity;
  }

  // The same product can be suggested by several cart items; keep the strongest rule.
  const bestByProduct = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) {
    const existing = bestByProduct.get(rule.suggestedProductId);
    if (!existing || dbToPct(rule.coPurchaseScore) > dbToPct(existing.coPurchaseScore)) {
      bestByProduct.set(rule.suggestedProductId, rule);
    }
  }

  const candidates: UpsellCandidate[] = [...bestByProduct.values()].map((rule) => ({
    ruleId: rule.id,
    productId: rule.suggestedProductId,
    productName: rule.suggestedProduct.name,
    categoryName: rule.suggestedProduct.category.name,
    listPricePaise: dbToPaise(rule.suggestedProduct.listPrice),
    costPaise: dbToPaise(rule.suggestedProduct.cost),
    isPromoted: rule.suggestedProduct.isPromoted,
    coPurchaseScore: dbToPct(rule.coPurchaseScore),
    minMarginPct: dbToPct(rule.minMarginPct),
  }));

  // The promotion boost is a business tunable like every other number in this system, so
  // it comes from the config table. No row is a supported state — the domain default keeps
  // ranking identical on a database nobody has configured.
  const config = await prisma.riskConfig.findUnique({ where: { id: "singleton" } });
  const promotionBoost = config ? dbToPct(config.promotionBoost) : DEFAULT_PROMOTION_BOOST;

  return rankSuggestions(candidates, cartProductIds, revenuePaise, costPaise, promotionBoost);
}
