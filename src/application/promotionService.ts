import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, dbToPct } from "@/infrastructure/money";
import {
  DEFAULT_MONTH_END_POLICY,
  evaluateMonthEndOffer,
  type GiftCandidate,
  type MonthEndLineInput,
  type MonthEndOffer,
  type MonthEndPolicy,
} from "@/domain/promotion/monthEnd";

/**
 * The month-end offer available on a quotation right now.
 *
 * Every figure the domain engine needs is assembled here and crosses the money boundary
 * exactly once, via `dbToPaise` / `dbToPct`. The engine itself never sees a Decimal, a
 * Prisma row or a clock — `today` is passed in, which is what lets the window logic be
 * tested against February in a leap year instead of hoping.
 *
 * Gift candidates are drawn from the cross-sell rules already attached to what is in the
 * cart, so a gift is always something the business configured as an accessory to this
 * product — never an arbitrary item out of the catalogue.
 */
export async function monthEndOfferFor(
  quotationId: string,
  today: Date = new Date(),
): Promise<MonthEndOffer> {
  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: {
      lines: {
        include: { product: { include: { category: true } }, variant: true },
      },
    },
  });

  const lines: MonthEndLineInput[] = quotation.lines.map((line) => {
    // Variant surcharges are part of what the customer pays, so they are part of what a
    // percentage bonus applies to. Omitting them understated the discount on every
    // variant line, which is the same class of bug the builder had before.
    const unitPaise = dbToPaise(line.unitPrice) + dbToPaise(line.variant?.extraPrice ?? 0);

    return {
      lineId: line.id,
      productName: line.product.name,
      categoryName: line.product.category.name,
      currentDiscountPct: dbToPct(line.discountPct),
      categoryMaxDiscountPct: dbToPct(line.product.category.maxDiscountPct),
      grossPaise: unitPaise * line.quantity,
    };
  });

  const cartProductIds = quotation.lines.map((l) => l.productId);

  const rules = cartProductIds.length
    ? await prisma.upsellRule.findMany({
        where: { triggerProductId: { in: cartProductIds } },
        include: { suggestedProduct: { include: { category: true } } },
      })
    : [];

  // A product already on the quotation is not a gift, it is a line the customer is paying
  // for. De-duplicated because several cart items can suggest the same accessory.
  const inCart = new Set(cartProductIds);
  const giftById = new Map<string, GiftCandidate>();
  for (const rule of rules) {
    if (inCart.has(rule.suggestedProductId)) continue;
    giftById.set(rule.suggestedProductId, {
      productId: rule.suggestedProductId,
      productName: rule.suggestedProduct.name,
      categoryName: rule.suggestedProduct.category.name,
      listPricePaise: dbToPaise(rule.suggestedProduct.listPrice),
    });
  }

  // Policy comes from the table when a manager has configured one, and falls back to the
  // tested defaults otherwise. "No row" is a supported state, not a broken one: the
  // feature behaves identically on a database nobody has touched, which is what makes the
  // table additive rather than a new way for the offer to stop working.
  const configured = await prisma.monthEndPromotion.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const policy: MonthEndPolicy = configured
    ? {
        windowDays: configured.windowDays,
        bonusDiscountPct: dbToPct(configured.bonusDiscountPct),
        maxGiftShareOfOrderPct: dbToPct(configured.maxGiftShareOfOrderPct),
      }
    : DEFAULT_MONTH_END_POLICY;

  return evaluateMonthEndOffer(today, lines, [...giftById.values()], policy);
}
