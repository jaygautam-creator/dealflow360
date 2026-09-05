import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPct } from "@/infrastructure/money";
import { rescoreAfterEdit, writeAudit } from "./quotationService";
import { DomainError } from "@/app/api/_lib/respond";

/**
 * Line editing.
 *
 * Every mutation here re-scores the quotation before returning, and none of them accepts
 * a total from the client. A client that could send its own price or risk score would make
 * the whole governance layer advisory.
 */

/** Statuses in which a quotation's lines may still be edited. */
const EDITABLE = new Set(["DRAFT", "APPROVED", "SENT", "UNDER_NEGOTIATION"]);

async function assertEditable(quotationId: string) {
  const q = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    select: { status: true, riskScore: true, salesOrder: { select: { id: true } } },
  });
  if (q.salesOrder) throw new DomainError("This quotation has been confirmed and can no longer be edited.");
  if (!EDITABLE.has(q.status)) {
    throw new DomainError(`A quotation in ${q.status} state cannot be edited.`);
  }
  return q;
}

export async function addLine(
  quotationId: string,
  input: { productId: string; variantId?: string | null; quantity: number; discountPct: number; fromUpsell?: boolean },
  actorId: string,
) {
  const before = await assertEditable(quotationId);

  return prisma.$transaction(async (tx) => {
    // Independent reads, issued together. Each sequential await is a full round trip to
    // a remote database, and this transaction has a deadline.
    const [quotation, product] = await Promise.all([
      tx.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { customer: true } }),
      tx.product.findUniqueOrThrow({ where: { id: input.productId }, include: { defaultPlan: true } }),
    ]);

    // Price is resolved server-side from the customer's tier list and snapshotted onto
    // the line, so a later price-list edit cannot rewrite an existing quotation.
    const [tierItem, maxSequence] = await Promise.all([
      tx.priceListItem.findFirst({
        where: { productId: product.id, priceList: { tier: quotation.customer.tier } },
      }),
      tx.quotationLine.aggregate({ where: { quotationId }, _max: { sequence: true } }),
    ]);
    const unitPrice = tierItem?.price ?? product.listPrice;

    await tx.quotationLine.create({
      data: {
        quotationId,
        productId: product.id,
        variantId: input.variantId ?? null,
        quantity: Math.max(1, Math.trunc(input.quantity)),
        unitPrice,
        unitCost: product.cost,
        discountPct: input.discountPct,
        taxPct: product.taxPct,
        // A subscription product bills recurring; everything else bills once.
        lineType: product.kind === "SUBSCRIPTION" ? "RECURRING" : "ONE_TIME",
        planId: product.kind === "SUBSCRIPTION" ? product.defaultPlanId : null,
        fromUpsell: input.fromUpsell ?? false,
        sequence: (maxSequence._max.sequence ?? 0) + 1,
      },
    });

    await writeAudit(tx, {
      entityType: "Quotation",
      entityId: quotationId,
      action: input.fromUpsell ? "UPSELL_ACCEPTED" : "LINE_ADDED",
      actorId,
      reason: `${product.name} x${input.quantity} at ${input.discountPct}% discount`,
      payload: { productId: product.id, quantity: input.quantity, discountPct: input.discountPct },
    });

    return rescoreAfterEdit(tx, quotationId, dbToPct(before.riskScore), actorId);
  });
}

export async function updateLine(
  lineId: string,
  input: { quantity?: number; discountPct?: number },
  actorId: string,
) {
  const line = await prisma.quotationLine.findUniqueOrThrow({
    where: { id: lineId },
    include: { product: true },
  });
  const before = await assertEditable(line.quotationId);

  return prisma.$transaction(async (tx) => {
    const previousDiscount = dbToPct(line.discountPct);

    await tx.quotationLine.update({
      where: { id: lineId },
      data: {
        ...(input.quantity !== undefined ? { quantity: Math.max(1, Math.trunc(input.quantity)) } : {}),
        ...(input.discountPct !== undefined ? { discountPct: input.discountPct } : {}),
      },
    });

    if (input.discountPct !== undefined && input.discountPct !== previousDiscount) {
      // Discount changes are audited separately from quantity changes — they are the
      // ones a governance review will actually want to read.
      await writeAudit(tx, {
        entityType: "QuotationLine",
        entityId: lineId,
        action: "DISCOUNT_CHANGED",
        actorId,
        reason: `${line.product.name}: ${previousDiscount}% to ${input.discountPct}%`,
        payload: { from: previousDiscount, to: input.discountPct },
      });
    }

    return rescoreAfterEdit(tx, line.quotationId, dbToPct(before.riskScore), actorId);
  });
}

export async function removeLine(lineId: string, actorId: string) {
  const line = await prisma.quotationLine.findUniqueOrThrow({
    where: { id: lineId },
    include: { product: true },
  });
  const before = await assertEditable(line.quotationId);

  return prisma.$transaction(async (tx) => {
    await tx.quotationLine.delete({ where: { id: lineId } });
    await writeAudit(tx, {
      entityType: "Quotation",
      entityId: line.quotationId,
      action: "LINE_REMOVED",
      actorId,
      reason: line.product.name,
      payload: { productId: line.productId },
    });
    return rescoreAfterEdit(tx, line.quotationId, dbToPct(before.riskScore), actorId);
  });
}
