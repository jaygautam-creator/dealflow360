import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, paiseToDb, dbToPct } from "@/infrastructure/money";
import { rescoreAfterEdit, writeAudit } from "./quotationService";
import { netLineTotal } from "@/domain/upsell/recommend";
import { applyPct } from "@/domain/shared/money";
import { DomainError } from "@/app/api/_lib/respond";
import { assertCanMutateQuotation } from "@/infrastructure/auth/guards";
import {
  MAX_REQUESTABLE_DISCOUNT_PCT,
  screenCounterOffer,
} from "@/domain/negotiation/counterOffer";
import type { Role } from "@/generated/prisma";
import type { SessionUser } from "@/infrastructure/auth/session";

/**
 * Customer portal service.
 *
 * The portal is a genuinely separate surface, not the internal screen with fields hidden.
 * Two rules make that real rather than cosmetic:
 *
 *  1. **Every read is re-scoped here**, from the session's customerId, and never from an
 *     id in the request. A customer asking for someone else's quotation gets "not found",
 *     which is the same answer they get for an id that does not exist.
 *  2. **Cost and margin never leave the server.** The portal view model is built field by
 *     field rather than by spreading a database row, so a column added later cannot leak
 *     into a customer's browser by accident.
 */

/** Statuses a customer is entitled to see. A draft is not yet a document. */
const CUSTOMER_VISIBLE = ["SENT", "UNDER_NEGOTIATION", "CONFIRMED"] as const;

function assertPortalUser(user: SessionUser): string {
  if (user.role !== "PORTAL" || !user.customerId) {
    throw new DomainError("This action is only available to a customer portal user.");
  }
  return user.customerId;
}

/**
 * A line's unit price in paise, variant surcharge included.
 *
 * The surcharge is part of what the customer pays, so it is part of every figure derived
 * from the unit price. Crossing to paise once, here, is what keeps the arithmetic below
 * out of floating point.
 */
export function unitPaise(line: {
  unitPrice: unknown;
  variant: { extraPrice: unknown } | null;
}): number {
  return dbToPaise(line.unitPrice as never) + dbToPaise((line.variant?.extraPrice ?? 0) as never);
}

export async function listPortalQuotations(user: SessionUser) {
  const customerId = assertPortalUser(user);

  const rows = await prisma.quotation.findMany({
    where: { customerId, status: { in: [...CUSTOMER_VISIBLE] } },
    include: { _count: { select: { lines: true, negotiations: true } } },
    orderBy: { lastActivityAt: "desc" },
  });

  // Only these fields. Deliberately not a spread of the row — riskScore, riskTrace and
  // marginPct all live on that model and none of them are the customer's business.
  return rows.map((q) => ({
    id: q.id,
    number: q.number,
    status: q.status,
    total: Number(q.total),
    lineCount: q._count.lines,
    messageCount: q._count.negotiations,
    lastActivityAt: q.lastActivityAt.toISOString(),
    validUntil: q.validUntil?.toISOString() ?? null,
  }));
}

export async function getPortalQuotation(user: SessionUser, quotationId: string) {
  const customerId = assertPortalUser(user);

  const quotation = await prisma.quotation.findFirst({
    // The customer scope is part of the query, not a check afterwards.
    where: { id: quotationId, customerId, status: { in: [...CUSTOMER_VISIBLE] } },
    include: {
      lines: { include: { product: true, variant: true, plan: true }, orderBy: { sequence: "asc" } },
      negotiations: { include: { author: { select: { name: true, role: true } } }, orderBy: { createdAt: "asc" } },
      owner: { select: { name: true, email: true } },
      salesOrder: { include: { invoices: { include: { payments: true } } } },
    },
  });

  if (!quotation) return null;

  return {
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    subtotal: Number(quotation.subtotal),
    discountTotal: Number(quotation.discountTotal),
    taxTotal: Number(quotation.taxTotal),
    total: Number(quotation.total),
    repName: quotation.owner.name,
    repEmail: quotation.owner.email,
    lines: quotation.lines.map((l) => ({
      id: l.id,
      productName: l.product.name,
      description: l.product.description,
      quantity: l.quantity,
      unitPrice: paiseToDb(unitPaise(l)),
      discountPct: dbToPct(l.discountPct),
      lineType: l.lineType,
      planName: l.plan?.name ?? null,
      // Computed here so the browser never receives unitCost, and computed in integer
      // paise because this is money. The previous form multiplied rupees as floats —
      // `(unitPrice + extraPrice) * qty * (1 - pct/100)` — which produced values like
      // 10229.8977 in the payload. Nothing visibly wrong rendered, because the portal
      // formats to whole rupees, but it was a float money calculation sitting outside the
      // money boundary on the one screen a customer actually reads.
      lineTotal: paiseToDb(netLineTotal(unitPaise(l), l.quantity, dbToPct(l.discountPct))),
    })),
    messages: quotation.negotiations.map((m) => ({
      id: m.id,
      body: m.body,
      lineId: m.lineId,
      requestedDiscountPct: m.requestedDiscountPct === null ? null : dbToPct(m.requestedDiscountPct),
      status: m.status,
      // The customer sees "you" or "the sales team", never an internal role name.
      fromCustomer: m.author.role === "PORTAL",
      authorName: m.author.role === "PORTAL" ? m.author.name : "Sales team",
      createdAt: m.createdAt.toISOString(),
    })),
    order: quotation.salesOrder
      ? {
          number: quotation.salesOrder.number,
          invoices: quotation.salesOrder.invoices.map((i) => ({
            id: i.id,
            number: i.number,
            type: i.type,
            status: i.status,
            amount: Number(i.amount),
            paid: paiseToDb(i.payments.reduce((s, p) => s + dbToPaise(p.amount), 0)),
          })),
        }
      : null,
  };
}

/**
 * A single invoice, formatted for the customer to view or print. Scoped the same way as
 * every other portal read: through the customer's own quotation, never from the id alone.
 */
export async function getPortalInvoice(user: SessionUser, invoiceId: string) {
  const customerId = assertPortalUser(user);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, salesOrder: { quotation: { customerId } } },
    include: {
      payments: { orderBy: { paidAt: "asc" } },
      salesOrder: {
        include: {
          quotation: {
            include: {
              customer: true,
              lines: { include: { product: true, variant: true, plan: true }, orderBy: { sequence: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!invoice) return null;

  const quotation = invoice.salesOrder.quotation;
  const paid = paiseToDb(invoice.payments.reduce((s, p) => s + dbToPaise(p.amount), 0));

  // Invoice type decides which lines belong on this document: a one-time invoice bills
  // the one-time lines, a recurring invoice bills the subscription line it was raised for.
  const billedLines = quotation.lines.filter((l) =>
    invoice.type === "RECURRING" ? l.lineType === "RECURRING" : l.lineType !== "RECURRING",
  );

  const lines = billedLines.map((l) => {
    const unit = unitPaise(l);
    const discountPct = dbToPct(l.discountPct);
    const taxPct = dbToPct(l.taxPct);
    const taxableValuePaise = netLineTotal(unit, l.quantity, discountPct);
    const taxPaise = applyPct(taxableValuePaise, taxPct);
    return {
      id: l.id,
      productName: l.product.name,
      quantity: l.quantity,
      unitPrice: paiseToDb(unit),
      discountPct,
      taxPct,
      taxableValue: paiseToDb(taxableValuePaise),
      taxAmount: paiseToDb(taxPaise),
      lineTotal: paiseToDb(taxableValuePaise + taxPaise),
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const taxableValue = lines.reduce((s, l) => s + l.taxableValue, 0);
  const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
  const discountTotal = subtotal - taxableValue;

  return {
    id: invoice.id,
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    amount: Number(invoice.amount),
    paid,
    subtotal,
    discountTotal,
    taxableValue,
    taxTotal,
    invoiceDate: invoice.createdAt.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    periodStart: invoice.periodStart?.toISOString() ?? null,
    periodEnd: invoice.periodEnd?.toISOString() ?? null,
    orderNumber: invoice.salesOrder.number,
    quotationNumber: quotation.number,
    customer: {
      name: quotation.customer.name,
      city: quotation.customer.city,
      country: quotation.customer.country,
    },
    lines,
    payments: invoice.payments.map((p) => ({
      amount: Number(p.amount),
      method: p.method,
      paidAt: p.paidAt.toISOString(),
    })),
  };
}

/**
 * A customer question, or a counter-offer on price.
 *
 * A counter is recorded, never applied. The customer states what they want; a human
 * decides whether it happens. Letting a portal message rewrite a discount directly would
 * hand the pricing policy to the person it exists to constrain.
 */
export async function postNegotiation(
  user: SessionUser,
  quotationId: string,
  input: { body: string; lineId?: string | null; requestedDiscountPct?: number | null },
) {
  const customerId = assertPortalUser(user);

  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, customerId, status: { in: [...CUSTOMER_VISIBLE] } },
    include: { lines: { select: { id: true } } },
  });
  if (!quotation) throw new DomainError("Quotation not found.");
  if (quotation.status === "CONFIRMED") {
    throw new DomainError("This quotation is already confirmed and can no longer be negotiated.");
  }

  if (input.lineId) {
    const validLine = quotation.lines.some((l) => l.id === input.lineId);
    if (!validLine) {
      throw new DomainError("The specified line does not belong to this quotation.");
    }
  }

  // An ask beyond the cap is refused by the system, not by a person. It is still recorded
  // — auto-declining in the open is governance you can see, where a silent 400 would leave
  // the rep unaware the customer ever asked and the customer unsure the message landed.
  const verdict =
    input.requestedDiscountPct != null
      ? screenCounterOffer(input.requestedDiscountPct)
      : ({ admissible: true } as const);

  return prisma.$transaction(async (tx) => {
    const message = await tx.negotiationMessage.create({
      data: {
        quotationId,
        authorId: user.id,
        lineId: input.lineId ?? null,
        body: input.body,
        requestedDiscountPct: input.requestedDiscountPct ?? null,
        status: verdict.admissible ? "OPEN" : "DECLINED",
      },
    });

    if (!verdict.admissible) {
      await writeAudit(tx, {
        entityType: "Quotation",
        entityId: quotationId,
        action: "COUNTER_OFFER_AUTO_DECLINED",
        actorId: user.id,
        reason: verdict.reason,
        payload: {
          messageId: message.id,
          lineId: input.lineId ?? null,
          requestedDiscountPct: input.requestedDiscountPct ?? null,
          capPct: MAX_REQUESTABLE_DISCOUNT_PCT,
        },
      });

      // The quotation's status is deliberately left alone. A refused ask is not a
      // negotiation, and moving the deal to UNDER_NEGOTIATION would put work on a rep's
      // board that the system has already closed.
      return {
        status: quotation.status,
        declined: true as const,
        reason: verdict.reason,
      };
    }

    // Moving into UNDER_NEGOTIATION is what surfaces the deal on the rep's board, and
    // touching lastActivityAt keeps it out of the stalled report.
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "UNDER_NEGOTIATION", lastActivityAt: new Date() },
    });

    await writeAudit(tx, {
      entityType: "Quotation",
      entityId: quotationId,
      action: input.requestedDiscountPct != null ? "CUSTOMER_COUNTER_OFFER" : "CUSTOMER_MESSAGE",
      actorId: user.id,
      reason: input.requestedDiscountPct != null
        ? `Customer requested ${input.requestedDiscountPct}%`
        : "Customer message",
      payload: { lineId: input.lineId ?? null, requestedDiscountPct: input.requestedDiscountPct ?? null },
    });

    return { status: "UNDER_NEGOTIATION", declined: false as const, reason: null };
  });
}

/**
 * The rep accepts a counter-offer.
 *
 * This is where the loop closes: applying the customer's discount re-scores the quotation,
 * and if the new score needs a longer approval chain than the one already satisfied, the
 * quotation goes back for approval on its own. Nobody has to remember to re-check it.
 */
export async function acceptCounterOffer(
  messageId: string,
  actor: { id: string; role?: Role } | string,
): Promise<{ applied: boolean; reapprovalRequired: boolean; reason: string; riskScore: number }> {
  const actorId = typeof actor === "string" ? actor : actor.id;
  const message = await prisma.negotiationMessage.findUniqueOrThrow({
    where: { id: messageId },
    include: { quotation: { select: { id: true, ownerId: true, riskScore: true } } },
  });

  assertCanMutateQuotation(actor, message.quotation);

  if (message.requestedDiscountPct === null) {
    throw new DomainError("This message is a question, not a discount request.");
  }
  if (message.status !== "OPEN") {
    throw new DomainError("This request has already been answered.");
  }

  const requested = dbToPct(message.requestedDiscountPct);
  const previousScore = dbToPct(message.quotation.riskScore);

  return prisma.$transaction(async (tx) => {
    if (message.lineId) {
      const line = await tx.quotationLine.findFirst({
        where: { id: message.lineId, quotationId: message.quotationId },
      });
      if (!line) {
        throw new DomainError("The specified line does not belong to this quotation.");
      }
      await tx.quotationLine.update({
        where: { id: line.id },
        data: { discountPct: requested },
      });
    } else {
      // An order-level counter applies to every line, which is what a customer means by
      // "give me 20% on this order".
      await tx.quotationLine.updateMany({
        where: { quotationId: message.quotationId },
        data: { discountPct: requested },
      });
    }

    await tx.negotiationMessage.update({ where: { id: messageId }, data: { status: "ACCEPTED" } });

    await writeAudit(tx, {
      entityType: "Quotation",
      entityId: message.quotationId,
      action: "COUNTER_OFFER_ACCEPTED",
      actorId,
      reason: `Applied customer's requested ${requested}%`,
      payload: { messageId, requestedDiscountPct: requested, lineId: message.lineId },
    });

    const rescore = await rescoreAfterEdit(tx, message.quotationId, previousScore, actorId);
    return {
      applied: true,
      reapprovalRequired: rescore.reapprovalRequired,
      reason: rescore.reason,
      riskScore: rescore.riskScore,
    };
  });
}

export async function declineCounterOffer(
  messageId: string,
  actor: { id: string; role?: Role } | string,
  reason: string,
) {
  const actorId = typeof actor === "string" ? actor : actor.id;
  const message = await prisma.negotiationMessage.findUniqueOrThrow({
    where: { id: messageId },
    include: { quotation: { select: { id: true, ownerId: true } } },
  });

  assertCanMutateQuotation(actor, message.quotation);
  if (message.status !== "OPEN") throw new DomainError("This request has already been answered.");

  return prisma.$transaction(async (tx) => {
    await tx.negotiationMessage.update({ where: { id: messageId }, data: { status: "DECLINED" } });
    await tx.negotiationMessage.create({
      data: { quotationId: message.quotationId, authorId: actorId, body: reason, status: "OPEN" },
    });
    await writeAudit(tx, {
      entityType: "Quotation",
      entityId: message.quotationId,
      action: "COUNTER_OFFER_DECLINED",
      actorId,
      reason,
      payload: { messageId },
    });
    return { declined: true };
  });
}

/** Sends a quotation to the customer, making it visible in their portal for the first time. */
export async function sendToCustomer(
  quotationId: string,
  actor: { id: string; role?: Role } | string,
) {
  const actorId = typeof actor === "string" ? actor : actor.id;
  const quotation = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  assertCanMutateQuotation(actor, quotation);

  // Publishing is a post-approval transition. Allowing DRAFT here would let an owner
  // sidestep the approval chain by publishing first and confirming from SENT.
  if (quotation.status !== "APPROVED") {
    throw new DomainError(`A quotation in ${quotation.status} state cannot be sent.`);
  }
  const pending = await prisma.approvalStep.count({ where: { quotationId, status: "PENDING" } });
  if (pending > 0) {
    throw new DomainError("This quotation is still awaiting approval and cannot be sent yet.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "SENT", lastActivityAt: new Date() },
    });
    await writeAudit(tx, {
      entityType: "Quotation",
      entityId: quotationId,
      action: "SENT_TO_CUSTOMER",
      actorId,
      reason: "Published to the customer portal",
    });
    return { status: "SENT" };
  });
}
