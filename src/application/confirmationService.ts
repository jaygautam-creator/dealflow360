import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, dbToPct, paiseToDb } from "@/infrastructure/money";
import { planFulfillment } from "@/domain/fulfillment/planner";
import type { DemandLine, WarehouseStock } from "@/domain/fulfillment/types";
import { splitBilling } from "@/domain/billing/billing";
import type { OneTimeLineInput, RecurringLineInput } from "@/domain/billing/types";
import { netLineTotal } from "@/domain/upsell/recommend";
import { applyPct } from "@/domain/shared/money";
import { addDays } from "@/domain/shared/dates";
import { writeAudit, loadApprovalRules } from "./quotationService";
import { DomainError } from "@/app/api/_lib/respond";
import { assertCanMutateQuotation } from "@/infrastructure/auth/guards";
import { routeForApproval } from "@/domain/risk/approvalRouting";
import type { SessionUser } from "@/infrastructure/auth/session";
import type { Prisma, Role } from "@/generated/prisma";

/**
 * Order confirmation.
 *
 * This is the one place where a quotation becomes real, and it does five things that must
 * either all happen or none of them: create the order, plan the warehouse split, reserve
 * the stock, raise the one-time invoice, and open the recurring billing schedules.
 *
 * All of it runs inside a single database transaction. Half-confirming an order — stock
 * decremented but no invoice raised, or an invoice raised against stock that was never
 * reserved — is precisely the kind of corruption that is painful to detect and worse to
 * unpick, so the transaction boundary is drawn around the whole operation rather than
 * around each step.
 */

export interface ConfirmationResult {
  salesOrderId: string;
  orderNumber: string;
  shipmentCount: number;
  isSingleShipment: boolean;
  hasBackorder: boolean;
  backorderUnits: number;
  planTrace: unknown;
  oneTimeInvoiceNumber: string | null;
  recurringScheduleCount: number;
  annualRecurringPaise: number;
}

export async function confirmQuotation(
  quotationId: string,
  actor: { id: string; role?: Role } | string,
): Promise<ConfirmationResult> {
  const actorId = typeof actor === "string" ? actor : actor.id;
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUniqueOrThrow({
      where: { id: quotationId },
      include: {
        lines: { include: { product: true, variant: true, plan: true } },
        salesOrder: true,
      },
    });

    assertCanMutateQuotation(actor, quotation);

    // Guard the state machine rather than trusting the caller's screen to be current.
    if (quotation.salesOrder) {
      throw new DomainError("This quotation has already been confirmed.");
    }
    if (quotation.status !== "APPROVED" && quotation.status !== "SENT" && quotation.status !== "UNDER_NEGOTIATION") {
      throw new DomainError(
        `A quotation in ${quotation.status} state cannot be confirmed. It must be approved first.`,
      );
    }
    const pending = await tx.approvalStep.count({ where: { quotationId, status: "PENDING" } });
    if (pending > 0) {
      throw new DomainError(`${pending} approval step(s) are still outstanding.`);
    }
    if (quotation.lines.length === 0) {
      throw new DomainError("An empty quotation cannot be confirmed.");
    }

    return executeOrderConfirmation(tx, quotation, actorId, `Confirmed from ${quotation.number}`);
  });
}

export async function confirmPortalQuotation(
  quotationId: string,
  user: SessionUser,
): Promise<ConfirmationResult> {
  if (user.role !== "PORTAL" || !user.customerId) {
    throw new DomainError("Only customer portal users may use this endpoint.");
  }

  const customerId = user.customerId;

  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findFirst({
      where: { id: quotationId, customerId },
      include: {
        lines: { include: { product: true, variant: true, plan: true } },
        salesOrder: true,
      },
    });

    if (!quotation) {
      throw new DomainError("Quotation not found.");
    }
    if (quotation.salesOrder) {
      throw new DomainError("This quotation has already been confirmed.");
    }
    if (quotation.status !== "SENT" && quotation.status !== "UNDER_NEGOTIATION") {
      throw new DomainError(`A quotation in ${quotation.status} state cannot be confirmed from the portal.`);
    }

    const openMessages = await tx.negotiationMessage.count({
      where: { quotationId, status: "OPEN" },
    });
    if (openMessages > 0) {
      throw new DomainError("There is an open counter-offer or discussion pending review by your sales contact.");
    }

    const pending = await tx.approvalStep.count({ where: { quotationId, status: "PENDING" } });
    if (pending > 0) {
      throw new DomainError("This quotation is awaiting internal approval and cannot be confirmed yet.");
    }

    // Verify whether the current terms require approval that was not satisfied
    const rules = await loadApprovalRules(tx);
    const score = dbToPct(quotation.riskScore);
    const routing = routeForApproval(score, rules);
    if (!routing.autoApprove && routing.requiredSteps.length > 0) {
      const approvedSteps = await tx.approvalStep.findMany({
        where: { quotationId, status: "APPROVED" },
        select: { level: true },
      });
      const approvedLevels = new Set(approvedSteps.map((s) => s.level));
      const missingSteps = routing.requiredSteps.filter((b) => !approvedLevels.has(b.level));
      if (missingSteps.length > 0) {
        // Re-route to approval workflow rather than bypassing!
        await tx.quotation.update({
          where: { id: quotationId },
          data: { status: "PENDING_MANAGER", lastActivityAt: new Date() },
        });
        await tx.approvalStep.createMany({
          data: missingSteps.map((b) => ({
            quotationId,
            level: b.level,
            sequence: b.sequence,
            triggeredByScore: quotation.riskScore,
            status: "PENDING",
          })),
        });
        await writeAudit(tx, {
          entityType: "Quotation",
          entityId: quotationId,
          action: "SUBMITTED_FOR_APPROVAL",
          actorId: user.id,
          reason: "Customer confirmed terms requiring managerial approval",
        });
        throw new DomainError(
          "Your requested terms require internal managerial approval before this quotation can be confirmed. Your sales representative has been notified.",
        );
      }
    }

    if (quotation.lines.length === 0) {
      throw new DomainError("An empty quotation cannot be confirmed.");
    }

    return executeOrderConfirmation(
      tx,
      quotation,
      user.id,
      `Confirmed by customer in portal from ${quotation.number}`,
    );
  });
}

/**
 * A quotation line as this function needs it, derived from the schema rather than
 * hand-written.
 *
 * It was `Array<any>`, which meant a schema change that dropped or renamed one of these
 * relations would compile cleanly and fail at confirmation — the single most expensive
 * place in the system to discover a mistake, since that is the transaction that creates
 * the order, the warehouse split, the invoices and the billing schedules together.
 * Deriving it from Prisma keeps it exact without anyone maintaining a copy by hand; both
 * call sites already load precisely this include.
 */
type ConfirmableLine = Prisma.QuotationLineGetPayload<{
  include: { product: true; variant: true; plan: true };
}>;

async function executeOrderConfirmation(
  tx: Prisma.TransactionClient,
  quotation: {
    id: string;
    number: string;
    lines: ConfirmableLine[];
  },
  actorId: string,
  auditReason: string,
): Promise<ConfirmationResult> {
  const quotationId = quotation.id;
  const orderNumber = await nextNumber(tx, "SO");
  const salesOrder = await tx.salesOrder.create({
    data: { number: orderNumber, quotationId, status: "CONFIRMED" },
  });

  // ── Fulfilment ──────────────────────────────────────────────────────────
  // Only physical goods are allocated. Services and subscriptions have no stock to
  // reserve, and feeding them to the planner would invent phantom shipments.
  const physicalLines = quotation.lines.filter((l) => l.product.kind === "ONE_TIME");

  let shipmentCount = 0;
  let isSingleShipment = false;
  let hasBackorder = false;
  let backorderUnits = 0;
  let planTrace: unknown = null;

  if (physicalLines.length > 0) {
    const warehouses = await tx.warehouse.findMany({
      where: { isActive: true },
      include: { stockLevels: true },
    });

    const stock: WarehouseStock[] = warehouses.map((w) => ({
      warehouseId: w.id,
      warehouseCode: w.code,
      warehouseName: w.name,
      shippingCostWeight: dbToPct(w.shippingCostWeight),
      available: Object.fromEntries(w.stockLevels.map((s) => [s.productId, s.quantity])),
    }));

    const demand: DemandLine[] = physicalLines.map((l) => {
      const unit = dbToPaise(l.unitPrice) + dbToPaise(l.variant?.extraPrice ?? 0);
      return {
        lineId: l.id,
        productId: l.productId,
        productName: l.product.name,
        quantity: l.quantity,
        valuePaise: netLineTotal(unit, l.quantity, dbToPct(l.discountPct)),
      };
    });

    const plan = planFulfillment({ lines: demand, warehouses: stock });

    const fulfillmentPlan = await tx.fulfillmentPlan.create({
      data: {
        salesOrderId: salesOrder.id,
        shipmentCount: plan.shipmentCount,
        totalShippingCost: plan.totalShippingCost,
        planTrace: plan.trace as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.fulfillmentAllocation.createMany({
      data: plan.allocations.map((a) => ({
        planId: fulfillmentPlan.id,
        lineId: a.lineId,
        productId: a.productId,
        warehouseId: a.warehouseId,
        quantity: a.quantity,
        isBackorder: a.isBackorder,
      })),
    });

    // Reserve the stock. Decrementing inside the same transaction is what stops two
    // orders confirmed at the same moment from both claiming the last unit.
    for (const allocation of plan.allocations) {
      if (allocation.isBackorder || !allocation.warehouseId) continue;
      await tx.stockLevel.update({
        where: {
          warehouseId_productId: {
            warehouseId: allocation.warehouseId,
            productId: allocation.productId,
          },
        },
        data: { quantity: { decrement: allocation.quantity } },
      });
    }

    shipmentCount = plan.shipmentCount;
    isSingleShipment = plan.isSingleShipment;
    hasBackorder = plan.hasBackorder;
    backorderUnits = plan.backorderUnits;
    planTrace = plan.trace;

    if (plan.hasBackorder) {
      await tx.salesOrder.update({
        where: { id: salesOrder.id },
        data: { status: "PARTIALLY_FULFILLED" },
      });
    }
  }

  // ── Billing ─────────────────────────────────────────────────────────────
  // One order splits into one one-time invoice (if any one-time lines exist) plus one
  // recurring schedule per subscription line.
  const oneTimeInputs: OneTimeLineInput[] = quotation.lines
    .filter((l) => l.lineType === "ONE_TIME")
    .map((l) => {
      const unit = dbToPaise(l.unitPrice) + dbToPaise(l.variant?.extraPrice ?? 0);
      const net = netLineTotal(unit, l.quantity, dbToPct(l.discountPct));
      return {
        lineId: l.id,
        productName: l.product.name,
        quantity: l.quantity,
        netAmountPaise: net,
        taxPaise: applyPct(net, dbToPct(l.taxPct)),
      };
    });

  const recurringInputs: RecurringLineInput[] = quotation.lines
    .filter((l) => l.lineType === "RECURRING" && l.plan !== null)
    .map((l) => {
      const unit = dbToPaise(l.unitPrice) + dbToPaise(l.variant?.extraPrice ?? 0);
      return {
        lineId: l.id,
        productName: l.product.name,
        planId: l.plan!.id,
        planName: l.plan!.name,
        interval: l.plan!.interval,
        quantity: l.quantity,
        unitAmountPaise: unit - applyPct(unit, dbToPct(l.discountPct)),
      };
    });

  const confirmedAt = new Date();
  const billing = splitBilling(confirmedAt, oneTimeInputs, recurringInputs);

  let oneTimeInvoiceNumber: string | null = null;
  if (billing.oneTimeInvoicePaise !== null) {
    const invoiceNumber = await nextNumber(tx, "INV");
    await tx.invoice.create({
      data: {
        number: invoiceNumber,
        type: "ONE_TIME",
        status: "OPEN",
        salesOrderId: salesOrder.id,
        amount: paiseToDb(billing.oneTimeInvoicePaise),
        dueDate: addDays(confirmedAt, 30),
      },
    });
    oneTimeInvoiceNumber = invoiceNumber;
  }

  for (const schedule of billing.schedules) {
    await tx.billingSchedule.create({
      data: {
        salesOrderId: salesOrder.id,
        lineId: schedule.lineId,
        planId: schedule.planId,
        interval: schedule.interval,
        amountPerPeriod: paiseToDb(schedule.amountPerPeriodPaise),
        nextBillingDate: schedule.nextBillingDate,
        periodsBilled: 1, // the first period is billed on confirmation
        status: "ACTIVE",
      },
    });

    // The first period is invoiced immediately, separately from the one-time invoice,
    // so a customer's subscription billing history is not tangled with hardware.
    const recurringInvoiceNumber = await nextNumber(tx, "INV");
    await tx.invoice.create({
      data: {
        number: recurringInvoiceNumber,
        type: "RECURRING",
        status: "OPEN",
        salesOrderId: salesOrder.id,
        amount: paiseToDb(schedule.amountPerPeriodPaise),
        periodStart: schedule.periodStart,
        periodEnd: schedule.periodEnd,
        isProrated: false,
        dueDate: addDays(confirmedAt, 7),
      },
    });
  }

  await tx.quotation.update({
    where: { id: quotationId },
    data: { status: "CONFIRMED", lastActivityAt: confirmedAt },
  });

  await writeAudit(tx, {
    entityType: "SalesOrder",
    entityId: salesOrder.id,
    action: "ORDER_CONFIRMED",
    actorId,
    reason: auditReason,
    payload: {
      quotationId,
      shipmentCount,
      hasBackorder,
      backorderUnits,
      oneTimeInvoice: oneTimeInvoiceNumber,
      recurringSchedules: billing.schedules.length,
    },
  });

  return {
    salesOrderId: salesOrder.id,
    orderNumber,
    shipmentCount,
    isSingleShipment,
    hasBackorder,
    backorderUnits,
    planTrace,
    oneTimeInvoiceNumber,
    recurringScheduleCount: billing.schedules.length,
    annualRecurringPaise: billing.annualRecurringPaise,
  };
}

/**
 * Sequential document numbers, allocated inside the caller's transaction.
 *
 * Counting existing rows is adequate here and is the honest trade-off for a hackathon:
 * under genuinely concurrent confirmations two callers could compute the same number, and
 * the unique constraint on `number` would reject the loser rather than silently duplicate.
 * A production version would use a Postgres sequence.
 */
async function nextNumber(tx: Prisma.TransactionClient, prefix: "SO" | "INV" | "CN"): Promise<string> {
  const year = new Date().getFullYear();
  const count =
    prefix === "SO"
      ? await tx.salesOrder.count()
      : prefix === "INV"
        ? await tx.invoice.count()
        : await tx.creditNote.count();
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}
