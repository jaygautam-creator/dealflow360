import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, dbToPct, paiseToDb } from "@/infrastructure/money";
import { assessBlendedRisk, explainRisk } from "@/domain/risk/blendedRisk";
import { routeForApproval, requiresReapproval, type ApprovalRuleInput } from "@/domain/risk/approvalRouting";
import { marginPct, netLineTotal } from "@/domain/upsell/recommend";
import { applyPct, sumPaise } from "@/domain/shared/money";
import type { RiskAssessment, RiskLineInput } from "@/domain/risk/types";
import type { Prisma } from "@/generated/prisma";

/**
 * Quotation service.
 *
 * This layer's whole job is orchestration: load state, hand it to the pure domain engines,
 * persist what comes back, and record why. It contains no business rules of its own — if a
 * decision is being made here rather than in src/domain, it is in the wrong place.
 *
 * Everything that changes a quotation goes through `recalculateQuotation`, so a total,
 * margin or risk score can never drift out of step with the lines that produced it. There
 * is deliberately no path that updates a line without re-scoring.
 */

type Tx = Prisma.TransactionClient;

export interface RecalculationResult {
  riskScore: number;
  assessment: RiskAssessment;
  explanation: string;
  subtotalPaise: number;
  discountTotalPaise: number;
  taxTotalPaise: number;
  totalPaise: number;
  marginPct: number;
}

/**
 * Re-prices and re-scores a quotation from its current lines, and writes the result.
 *
 * Called after every mutation. The alternative — updating totals incrementally as lines
 * change — is how a quotation ends up with a total that does not match its own lines.
 */
export async function recalculateQuotation(
  tx: Tx,
  quotationId: string,
): Promise<RecalculationResult> {
  const quotation = await tx.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: {
      customer: true,
      lines: { include: { product: { include: { category: true } }, variant: true } },
    },
  });

  const [tierCeiling, riskConfig] = await Promise.all([
    tx.tierDiscountCeiling.findUnique({ where: { tier: quotation.customer.tier } }),
    tx.riskConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  // Fail closed: a missing ceiling must not be read as "unlimited discount allowed".
  const tierCeilingPct = tierCeiling ? dbToPct(tierCeiling.maxDiscountPct) : 0;
  const aggregateAmplifier = riskConfig ? dbToPct(riskConfig.aggregateAmplifier) : 1.5;

  const riskLines: RiskLineInput[] = quotation.lines.map((line) => ({
    lineId: line.id,
    productName: line.product.name,
    categoryName: line.product.category.name,
    categoryCeilingPct: dbToPct(line.product.category.maxDiscountPct),
    quantity: line.quantity,
    unitPricePaise: dbToPaise(line.unitPrice) + dbToPaise(line.variant?.extraPrice ?? 0),
    discountPct: dbToPct(line.discountPct),
  }));

  const assessment = assessBlendedRisk({
    customerTier: quotation.customer.tier,
    tierCeilingPct,
    lines: riskLines,
    aggregateAmplifier,
  });

  // Monetary totals, all in integer paise until the final write.
  const perLine = quotation.lines.map((line) => {
    const unit = dbToPaise(line.unitPrice) + dbToPaise(line.variant?.extraPrice ?? 0);
    const gross = unit * line.quantity;
    const net = netLineTotal(unit, line.quantity, dbToPct(line.discountPct));
    return {
      grossPaise: gross,
      discountPaise: gross - net,
      netPaise: net,
      taxPaise: applyPct(net, dbToPct(line.taxPct)),
      costPaise: dbToPaise(line.unitCost) * line.quantity,
    };
  });

  const subtotalPaise = sumPaise(perLine.map((l) => l.grossPaise));
  const discountTotalPaise = sumPaise(perLine.map((l) => l.discountPaise));
  const netPaise = sumPaise(perLine.map((l) => l.netPaise));
  const taxTotalPaise = sumPaise(perLine.map((l) => l.taxPaise));
  const totalPaise = netPaise + taxTotalPaise;
  const costPaise = sumPaise(perLine.map((l) => l.costPaise));

  // Margin is measured on net revenue, excluding tax — tax is collected, not earned.
  const margin = Math.round(marginPct(netPaise, costPaise) * 100) / 100;

  await tx.quotation.update({
    where: { id: quotationId },
    data: {
      riskScore: assessment.score,
      riskTrace: assessment as unknown as Prisma.InputJsonValue,
      subtotal: paiseToDb(subtotalPaise),
      discountTotal: paiseToDb(discountTotalPaise),
      taxTotal: paiseToDb(taxTotalPaise),
      total: paiseToDb(totalPaise),
      marginPct: margin,
      lastActivityAt: new Date(),
    },
  });

  return {
    riskScore: assessment.score,
    assessment,
    explanation: explainRisk(assessment),
    subtotalPaise,
    discountTotalPaise,
    taxTotalPaise,
    totalPaise,
    marginPct: margin,
  };
}

/** Loads the configured approval bands in the order the router expects. */
export async function loadApprovalRules(tx: Tx): Promise<ApprovalRuleInput[]> {
  const rules = await tx.approvalRule.findMany({ orderBy: { sequence: "asc" } });
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    minScore: dbToPct(r.minScore),
    maxScore: r.maxScore === null ? null : dbToPct(r.maxScore),
    requiresManager: r.requiresManager,
    requiresFinance: r.requiresFinance,
    sequence: r.sequence,
  }));
}

export interface SubmissionResult {
  status: "APPROVED" | "PENDING_MANAGER";
  riskScore: number;
  explanation: string;
  routingExplanation: string;
  requiredSteps: { level: string; sequence: number }[];
}

/**
 * Submits a quotation into the approval chain — or straight through, if the score does not
 * warrant review. The rep never chooses; routing is entirely a function of the score and
 * the configured bands, which is the point of "self-governing".
 */
export async function submitForApproval(
  quotationId: string,
  actorId: string,
): Promise<SubmissionResult> {
  return prisma.$transaction(async (tx) => {
    const recalc = await recalculateQuotation(tx, quotationId);
    const rules = await loadApprovalRules(tx);
    const routing = routeForApproval(recalc.riskScore, rules);

    // Any previously pending steps are superseded by this submission.
    await tx.approvalStep.deleteMany({ where: { quotationId, status: "PENDING" } });

    if (routing.autoApprove) {
      await tx.quotation.update({ where: { id: quotationId }, data: { status: "APPROVED" } });
      await writeAudit(tx, {
        entityType: "Quotation",
        entityId: quotationId,
        action: "AUTO_APPROVED",
        actorId,
        reason: routing.explanation,
        payload: { riskScore: recalc.riskScore, risk: recalc.explanation },
      });
      return {
        status: "APPROVED" as const,
        riskScore: recalc.riskScore,
        explanation: recalc.explanation,
        routingExplanation: routing.explanation,
        requiredSteps: [],
      };
    }

    await tx.approvalStep.createMany({
      data: routing.requiredSteps.map((step) => ({
        quotationId,
        level: step.level,
        sequence: step.sequence,
        status: "PENDING" as const,
        triggeredByScore: recalc.riskScore,
      })),
    });

    await tx.quotation.update({ where: { id: quotationId }, data: { status: "PENDING_MANAGER" } });
    await writeAudit(tx, {
      entityType: "Quotation",
      entityId: quotationId,
      action: "SUBMITTED_FOR_APPROVAL",
      actorId,
      reason: routing.explanation,
      payload: { riskScore: recalc.riskScore, risk: recalc.explanation, steps: routing.requiredSteps },
    });

    return {
      status: "PENDING_MANAGER" as const,
      riskScore: recalc.riskScore,
      explanation: recalc.explanation,
      routingExplanation: routing.explanation,
      requiredSteps: routing.requiredSteps,
    };
  });
}

/**
 * Re-scores after an edit and decides whether standing approvals survive.
 *
 * This is what closes the approve-then-raise-discount exploit: an approved quotation whose
 * score moves into a stricter band is pushed back into the chain automatically, without
 * anyone having to notice.
 */
export async function rescoreAfterEdit(
  tx: Tx,
  quotationId: string,
  previousScore: number,
  actorId: string,
): Promise<{ reapprovalRequired: boolean; reason: string; riskScore: number }> {
  const recalc = await recalculateQuotation(tx, quotationId);
  const rules = await loadApprovalRules(tx);
  const verdict = requiresReapproval(previousScore, recalc.riskScore, rules);

  if (verdict.required) {
    const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    // Only quotations that had already cleared or entered approval need resetting; a
    // draft is not "re-approved", it simply has not been submitted yet.
    if (quotation.status !== "DRAFT") {
      await tx.approvalStep.deleteMany({ where: { quotationId, status: "PENDING" } });
      await tx.quotation.update({ where: { id: quotationId }, data: { status: "DRAFT" } });
      await writeAudit(tx, {
        entityType: "Quotation",
        entityId: quotationId,
        action: "APPROVAL_RESET_BY_EDIT",
        actorId,
        reason: verdict.reason,
        payload: { previousScore, newScore: recalc.riskScore },
      });
    }
  }

  return { reapprovalRequired: verdict.required, reason: verdict.reason, riskScore: recalc.riskScore };
}

export interface AuditInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  reason?: string | null;
  payload?: unknown;
}

/**
 * Append-only audit write. Every state change in the system funnels through here, so
 * "who changed this and why" is always answerable rather than usually answerable.
 */
export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId ?? null,
      reason: input.reason ?? null,
      payload: (input.payload ?? null) as Prisma.InputJsonValue,
    },
  });
}
