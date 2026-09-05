import "server-only";
import { prisma } from "@/infrastructure/db";
import { writeAudit } from "./quotationService";
import { DomainError } from "@/app/api/_lib/respond";
import type { Role } from "@/generated/prisma";

/**
 * Approval service.
 *
 * Three invariants are enforced here, and each one exists because the obvious
 * implementation gets it wrong:
 *
 *  1. **Separation of duties.** Nobody approves their own quotation, whatever their role.
 *     An approval chain a rep can satisfy alone is decoration.
 *  2. **Sequence.** Only the earliest pending step is actionable. Finance is never asked
 *     to sign off on something the manager has not yet seen.
 *  3. **Level match.** A manager cannot discharge the finance step by holding a more
 *     senior-sounding role. The step names the level, and only that level clears it.
 */

const LEVEL_ROLE: Record<"SALES_MANAGER" | "FINANCE", Role> = {
  SALES_MANAGER: "SALES_MANAGER",
  FINANCE: "FINANCE",
};

export interface ApprovalActionResult {
  quotationStatus: string;
  remainingSteps: number;
  message: string;
}

/** The earliest still-pending step, which is the only one anyone may act on. */
async function loadActionableStep(quotationId: string) {
  const step = await prisma.approvalStep.findFirst({
    where: { quotationId, status: "PENDING" },
    orderBy: { sequence: "asc" },
  });
  if (!step) throw new DomainError("This quotation has no approval step awaiting a decision.");
  return step;
}

function assertMayAct(
  step: { level: "SALES_MANAGER" | "FINANCE" },
  actor: { id: string; role: Role },
  quotationOwnerId: string,
) {
  if (actor.role === "ADMIN") return; // Admins may unblock a stuck chain.

  if (actor.id === quotationOwnerId) {
    throw new DomainError(
      "You cannot approve a quotation you own. Approval requires a second person.",
    );
  }
  if (actor.role !== LEVEL_ROLE[step.level]) {
    throw new DomainError(
      `This step needs ${step.level.replace("_", " ").toLowerCase()} approval, which your role cannot provide.`,
    );
  }
}

export async function approveStep(
  quotationId: string,
  actor: { id: string; role: Role },
  reason?: string,
): Promise<ApprovalActionResult> {
  const step = await loadActionableStep(quotationId);

  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    assertMayAct(step, actor, quotation.ownerId);

    await tx.approvalStep.update({
      where: { id: step.id },
      data: { status: "APPROVED", approverId: actor.id, decidedAt: new Date(), reason: reason ?? null },
    });

    const remaining = await tx.approvalStep.count({ where: { quotationId, status: "PENDING" } });

    // The chain advances one level at a time; the quotation is only approved when the
    // last step clears.
    const nextStatus = remaining === 0 ? "APPROVED" : "PENDING_FINANCE";
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: nextStatus, lastActivityAt: new Date() },
    });

    await writeAudit(tx, {
      entityType: "ApprovalStep",
      entityId: step.id,
      action: "APPROVED",
      actorId: actor.id,
      reason: reason ?? null,
      payload: { quotationId, level: step.level, triggeredByScore: step.triggeredByScore.toString() },
    });

    return {
      quotationStatus: nextStatus,
      remainingSteps: remaining,
      message:
        remaining === 0
          ? "Fully approved. The quotation can now be confirmed."
          : `Approved at ${step.level.replace("_", " ").toLowerCase()} level. ${remaining} step(s) remaining.`,
    };
  });
}

export async function rejectStep(
  quotationId: string,
  actor: { id: string; role: Role },
  reason: string,
): Promise<ApprovalActionResult> {
  if (!reason?.trim()) {
    // A rejection with no reason is unactionable for the rep who has to fix it.
    throw new DomainError("A rejection must include a reason.");
  }
  const step = await loadActionableStep(quotationId);

  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    assertMayAct(step, actor, quotation.ownerId);

    await tx.approvalStep.update({
      where: { id: step.id },
      data: { status: "REJECTED", approverId: actor.id, decidedAt: new Date(), reason },
    });
    // Later steps are moot once an earlier one rejects.
    await tx.approvalStep.updateMany({
      where: { quotationId, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "REJECTED", lastActivityAt: new Date() },
    });

    await writeAudit(tx, {
      entityType: "ApprovalStep",
      entityId: step.id,
      action: "REJECTED",
      actorId: actor.id,
      reason,
      payload: { quotationId, level: step.level },
    });

    return { quotationStatus: "REJECTED", remainingSteps: 0, message: "Quotation rejected." };
  });
}

/**
 * Returns the quotation to the rep for changes without killing it outright. The chain is
 * discarded rather than paused: whatever the rep changes will be re-scored, and the new
 * score decides the chain afresh.
 */
export async function returnForRevision(
  quotationId: string,
  actor: { id: string; role: Role },
  reason: string,
): Promise<ApprovalActionResult> {
  if (!reason?.trim()) {
    throw new DomainError("Returning a quotation for revision requires a reason.");
  }
  const step = await loadActionableStep(quotationId);

  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    assertMayAct(step, actor, quotation.ownerId);

    await tx.approvalStep.update({
      where: { id: step.id },
      data: { status: "RETURNED", approverId: actor.id, decidedAt: new Date(), reason },
    });
    await tx.approvalStep.updateMany({
      where: { quotationId, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "DRAFT", lastActivityAt: new Date() },
    });

    await writeAudit(tx, {
      entityType: "ApprovalStep",
      entityId: step.id,
      action: "RETURNED_FOR_REVISION",
      actorId: actor.id,
      reason,
      payload: { quotationId, level: step.level },
    });

    return {
      quotationStatus: "DRAFT",
      remainingSteps: 0,
      message: "Returned to the rep. It will be re-scored and re-routed when resubmitted.",
    };
  });
}

/** The full decision history for a quotation, newest first. Rendered on the approval screen. */
export async function approvalHistory(quotationId: string) {
  return prisma.approvalStep.findMany({
    where: { quotationId },
    include: { approver: { select: { name: true, role: true } } },
    orderBy: [{ sequence: "asc" }],
  });
}
