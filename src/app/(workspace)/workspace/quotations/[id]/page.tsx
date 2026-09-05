import { notFound } from "next/navigation";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { getQuotation, auditTrail, catalogueForCustomer } from "@/application/queries";
import { suggestionsFor } from "@/application/upsellService";
import { monthEndOfferFor } from "@/application/promotionService";
import { dbToPaise, dbToPct } from "@/infrastructure/money";
import { QuotationBuilder } from "./QuotationBuilder";
import type { RiskAssessment } from "@/domain/risk/types";

export const dynamic = "force-dynamic";

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;

  // getQuotation applies the caller's tenancy scope, so an id belonging to someone else
  // simply is not found — the same response as an id that does not exist.
  const quotation = await getQuotation(user, id);
  if (!quotation) notFound();

  const [catalogue, suggestions, audit, monthEndOffer] = await Promise.all([
    catalogueForCustomer(quotation.customerId),
    suggestionsFor(quotation.id),
    auditTrail("Quotation", quotation.id),
    monthEndOfferFor(quotation.id),
  ]);

  // Prisma Decimals cannot cross the server/client boundary, so the view model is built
  // here with money already reduced to plain numbers.
  const view = {
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    customerName: quotation.customer.name,
    customerTier: quotation.customer.tier,
    ownerName: quotation.owner.name,
    ownerId: quotation.owner.id,
    riskScore: dbToPct(quotation.riskScore),
    subtotal: Number(quotation.subtotal),
    discountTotal: Number(quotation.discountTotal),
    taxTotal: Number(quotation.taxTotal),
    total: Number(quotation.total),
    marginPct: dbToPct(quotation.marginPct),
    lines: quotation.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.product.name,
      variantLabel: l.variant ? `${l.variant.attribute}: ${l.variant.value}` : null,
      categoryName: l.product.category.name,
      categoryCeilingPct: dbToPct(l.product.category.maxDiscountPct),
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      discountPct: dbToPct(l.discountPct),
      lineType: l.lineType,
      planName: l.plan?.name ?? null,
      fromUpsell: l.fromUpsell,
      netTotal:
        (dbToPaise(l.unitPrice) * l.quantity -
          Math.round((dbToPaise(l.unitPrice) * l.quantity * dbToPct(l.discountPct)) / 100)) /
        100,
    })),
    approvalSteps: quotation.approvalSteps.map((s) => ({
      id: s.id,
      level: s.level,
      status: s.status,
      sequence: s.sequence,
      approverName: s.approver?.name ?? null,
      reason: s.reason,
      decidedAt: s.decidedAt?.toISOString() ?? null,
      triggeredByScore: dbToPct(s.triggeredByScore),
    })),
    salesOrder: quotation.salesOrder
      ? {
          number: quotation.salesOrder.number,
          status: quotation.salesOrder.status,
          shipmentCount: quotation.salesOrder.fulfillmentPlan?.shipmentCount ?? 0,
          allocations:
            quotation.salesOrder.fulfillmentPlan?.allocations.map((a) => ({
              id: a.id,
              productName: a.product.name,
              warehouseName: a.warehouse?.name ?? null,
              quantity: a.quantity,
              isBackorder: a.isBackorder,
            })) ?? [],
          invoices: quotation.salesOrder.invoices.map((i) => ({
            id: i.id,
            number: i.number,
            type: i.type,
            status: i.status,
            amount: Number(i.amount),
            isProrated: i.isProrated,
            periodStart: i.periodStart?.toISOString() ?? null,
            periodEnd: i.periodEnd?.toISOString() ?? null,
            paidAmount: i.payments.reduce((s, p) => s + Number(p.amount), 0),
          })),
          schedules: quotation.salesOrder.schedules.map((s) => ({
            id: s.id,
            productName: s.line.product.name,
            planName: s.plan.name,
            interval: s.interval,
            amountPerPeriod: Number(s.amountPerPeriod),
            nextBillingDate: s.nextBillingDate.toISOString(),
            status: s.status,
          })),
        }
      : null,
  };

  const assessment = (quotation.riskTrace as unknown as RiskAssessment | null) ?? null;

  const negotiations = quotation.negotiations.map((n) => {
    const line = n.lineId ? quotation.lines.find((l) => l.id === n.lineId) : undefined;
    return {
      id: n.id,
      authorName: n.author.name,
      authorRole: n.author.role,
      body: n.body,
      lineId: n.lineId,
      lineProductName: line?.product.name ?? null,
      requestedDiscountPct: n.requestedDiscountPct === null ? null : dbToPct(n.requestedDiscountPct),
      status: n.status,
      createdAt: n.createdAt.toISOString(),
    };
  });

  return (
    <QuotationBuilder
      quotation={view}
      negotiations={negotiations}
      assessment={assessment}
      initialSuggestions={suggestions}
      // Decided here, not in the component. Returning null from the panel would still
      // serialise the whole offer into the RSC payload, so "25 days remain" would sit in
      // view-source for any rep to read. An offer that is not live is not sent at all.
      monthEndOffer={monthEndOffer.eligible ? monthEndOffer : null}
      products={catalogue.products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        categoryName: p.category.name,
        categoryCeilingPct: dbToPct(p.category.maxDiscountPct),
        price: Number(p.effectivePrice),
        kind: p.kind,
        // Sent to the client so the picker can show the price the customer will actually
        // pay before the line is added. The server still resolves the real price on add —
        // this list is for display, never the source of truth.
        variants: p.variants.map((v) => ({
          id: v.id,
          attribute: v.attribute,
          value: v.value,
          extraPrice: Number(v.extraPrice),
        })),
      }))}
      audit={audit.map((a) => ({
        id: a.id,
        action: a.action,
        reason: a.reason,
        actorName: a.actor?.name ?? "System",
        createdAt: a.createdAt.toISOString(),
      }))}
      permissions={{
        mayEdit: can(user.role, P.QUOTATION_UPDATE) && user.id === quotation.ownerId,
        mayApproveManager: can(user.role, P.APPROVE_AS_MANAGER),
        mayApproveFinance: can(user.role, P.APPROVE_AS_FINANCE),
        mayConfirm: can(user.role, P.QUOTATION_CONFIRM),
        isOwner: user.id === quotation.ownerId,
      }}
    />
  );
}
