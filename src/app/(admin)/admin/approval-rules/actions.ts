"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { prisma } from "@/infrastructure/db";
import { guardConfigWrite } from "../_lib/authGuard";

const ruleSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    minScore: z.coerce.number(),
    maxScore: z.union([z.coerce.number(), z.literal("")]).optional(),
    requiresManager: z.coerce.boolean(),
    requiresFinance: z.coerce.boolean(),
    sequence: z.coerce.number().int(),
  })
  .refine(
    (data) => data.maxScore === "" || data.maxScore === undefined || data.maxScore > data.minScore,
    { message: "Max score must be greater than min score", path: ["maxScore"] }
  );

function parse(formData: FormData) {
  return ruleSchema.safeParse({
    name: formData.get("name"),
    minScore: formData.get("minScore"),
    maxScore: formData.get("maxScore") || undefined,
    requiresManager: formData.has("requiresManager"),
    requiresFinance: formData.has("requiresFinance"),
    sequence: formData.get("sequence") || 0,
  });
}

function toData(parsed: z.infer<typeof ruleSchema>) {
  return {
    name: parsed.name,
    minScore: parsed.minScore,
    maxScore: parsed.maxScore === "" || parsed.maxScore === undefined ? null : parsed.maxScore,
    requiresManager: parsed.requiresManager,
    requiresFinance: parsed.requiresFinance,
    sequence: parsed.sequence,
  };
}

/**
 * Routing (routeForApproval) takes the first band whose range contains the score, in the
 * admin-editable "Order" (sequence) field's order — not sorted by minScore. That is only
 * ever safe if bands never overlap: two overlapping bands would let whichever one has the
 * lower "Order" silently win, which could route a quotation to less approval than its
 * score actually requires. Nothing else in this screen stops an admin creating that
 * overlap, so it is refused here.
 */
async function assertNoOverlap(
  minScore: number,
  maxScore: number | null,
  excludeId?: string,
): Promise<string | null> {
  const others = await prisma.approvalRule.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: { name: true, minScore: true, maxScore: true },
  });
  const newMax = maxScore ?? Infinity;
  for (const other of others) {
    const otherMin = Number(other.minScore);
    const otherMax = other.maxScore === null ? Infinity : Number(other.maxScore);
    // Half-open bands [min, max) overlap iff each starts before the other ends.
    if (minScore < otherMax && otherMin < newMax) {
      return `This score band overlaps "${other.name}" (${otherMin}–${other.maxScore === null ? "∞" : otherMax}). Bands must not overlap, or routing depends on which one happens to be listed first.`;
    }
  }
  return null;
}

export async function createApprovalRule(formData: FormData) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = toData(parsed.data);
  const overlapError = await assertNoOverlap(data.minScore, data.maxScore);
  if (overlapError) return { error: overlapError };

  await prisma.$transaction(async (tx) => {
    const rule = await tx.approvalRule.create({ data });

    await tx.auditEvent.create({
      data: {
        entityType: "ApprovalRule",
        entityId: rule.id,
        action: "CREATED",
        actorId: user.id,
        reason: `Created approval rule "${rule.name}"`,
        payload: data,
      },
    });
  });

  revalidatePath("/admin/approval-rules");
}

export async function updateApprovalRule(id: string, formData: FormData) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = toData(parsed.data);
  const overlapError = await assertNoOverlap(data.minScore, data.maxScore, id);
  if (overlapError) return { error: overlapError };

  await prisma.$transaction(async (tx) => {
    await tx.approvalRule.update({ where: { id }, data });

    await tx.auditEvent.create({
      data: {
        entityType: "ApprovalRule",
        entityId: id,
        action: "UPDATED",
        actorId: user.id,
        reason: `Updated approval rule "${data.name}"`,
        payload: data,
      },
    });
  });

  revalidatePath("/admin/approval-rules");
}

export async function deleteApprovalRule(id: string) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.approvalRule.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "ApprovalRule",
        entityId: id,
        action: "DELETED",
        actorId: user.id,
        reason: `Deleted approval rule "${deleted.name}"`,
      },
    });
  });

  revalidatePath("/admin/approval-rules");
}
