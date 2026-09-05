import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPct } from "@/infrastructure/money";
import { rescoreAfterEdit, writeAudit } from "./quotationService";
import { DomainError } from "@/app/api/_lib/respond";
import { assertCanMutateQuotation } from "@/infrastructure/auth/guards";
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
      unitPrice: Number(l.unitPrice) + Number(l.variant?.extraPrice ?? 0),
      discountPct: dbToPct(l.discountPct),
      lineType: l.lineType,
      planName: l.plan?.name ?? null,
      // Computed here so the browser never receives unitCost.
      lineTotal:
        (Number(l.unitPrice) + Number(l.variant?.extraPrice ?? 0)) *
        l.quantity *
        (1 - dbToPct(l.discountPct) / 100),
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
            number: i.number,
            type: i.type,
            status: i.status,
            amount: Number(i.amount),
            paid: i.payments.reduce((s, p) => s + Number(p.amount), 0),
          })),
        }
      : null,
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

  return prisma.$transaction(async (tx) => {
    await tx.negotiationMessage.create({
      data: {
        quotationId,
        authorId: user.id,
        lineId: input.lineId ?? null,
        body: input.body,
        requestedDiscountPct: input.requestedDiscountPct ?? null,
        status: "OPEN",
      },
    });

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

    return { status: "UNDER_NEGOTIATION" };
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

  if (quotation.status !== "APPROVED" && quotation.status !== "DRAFT") {
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
