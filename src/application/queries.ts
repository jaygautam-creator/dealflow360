import "server-only";
import { prisma } from "@/infrastructure/db";
import { quotationScopeFor } from "@/infrastructure/auth/rbac";
import type { SessionUser } from "@/infrastructure/auth/session";
import type { Prisma } from "@/generated/prisma";

/**
 * Read-side queries.
 *
 * Every quotation read in the application goes through `scopedQuotationWhere`. Building
 * the tenancy filter here — rather than at each call site — means a new screen cannot
 * accidentally ship without scoping, which is the usual way a portal user ends up seeing
 * another customer's deals.
 */

/** Translates a principal into the WHERE clause they are allowed to see. */
export function scopedQuotationWhere(user: SessionUser): Prisma.QuotationWhereInput {
  const scope = quotationScopeFor(user.role, user.id, user.customerId);
  switch (scope.kind) {
    case "ALL":
      return {};
    case "OWN":
      return { ownerId: scope.ownerId };
    case "CUSTOMER":
      // Portal users additionally never see a draft — a quotation the rep has not sent
      // is not yet a document the customer is entitled to read.
      return {
        customerId: scope.customerId,
        status: { in: ["SENT", "UNDER_NEGOTIATION", "CONFIRMED"] },
      };
    case "NONE":
      // An impossible filter rather than an empty one: `{}` would return everything.
      return { id: "__none__" };
  }
}

export async function listQuotations(user: SessionUser) {
  return prisma.quotation.findMany({
    where: scopedQuotationWhere(user),
    include: {
      customer: { select: { name: true, tier: true } },
      owner: { select: { name: true } },
      _count: { select: { lines: true } },
      approvalSteps: { where: { status: "PENDING" }, select: { level: true } },
    },
    orderBy: { lastActivityAt: "desc" },
  });
}

export async function getQuotation(user: SessionUser, id: string) {
  return prisma.quotation.findFirst({
    // The scope filter is ANDed with the id, so an unauthorised id simply returns null
    // rather than leaking existence through a different error.
    where: { AND: [{ id }, scopedQuotationWhere(user)] },
    include: {
      customer: true,
      owner: { select: { id: true, name: true, email: true } },
      lines: {
        include: { product: { include: { category: true } }, variant: true, plan: true },
        orderBy: { sequence: "asc" },
      },
      approvalSteps: {
        include: { approver: { select: { name: true, role: true } } },
        orderBy: { sequence: "asc" },
      },
      negotiations: {
        include: { author: { select: { name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      salesOrder: {
        include: {
          fulfillmentPlan: { include: { allocations: { include: { warehouse: true, product: true } } } },
          invoices: { include: { payments: true, creditNotes: true } },
          schedules: { include: { plan: true, line: { include: { product: true } } } },
        },
      },
    },
  });
}

/** The audit trail for one entity, newest first. */
export async function auditTrail(entityType: string, entityId: string) {
  return prisma.auditEvent.findMany({
    where: { entityType, entityId },
    include: { actor: { select: { name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Catalogue for the quotation builder, with the price resolved for this customer's tier. */
export async function catalogueForCustomer(customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

  const [products, priceList] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, variants: true, defaultPlan: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.priceList.findFirst({
      where: { tier: customer.tier },
      include: { items: true },
    }),
  ]);

  const tierPrice = new Map(priceList?.items.map((i) => [i.productId, i.price]) ?? []);

  return {
    customer,
    products: products.map((p) => ({
      ...p,
      // The tier list wins when it covers the product; otherwise the list price stands.
      effectivePrice: tierPrice.get(p.id) ?? p.listPrice,
    })),
  };
}
