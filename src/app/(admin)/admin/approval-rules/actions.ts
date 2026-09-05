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

export async function createApprovalRule(formData: FormData) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = toData(parsed.data);
  const rule = await prisma.approvalRule.create({ data });

  await prisma.auditEvent.create({
    data: {
      entityType: "ApprovalRule",
      entityId: rule.id,
      action: "CREATED",
      actorId: user.id,
      reason: `Created approval rule "${rule.name}"`,
      payload: data,
    },
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
  await prisma.approvalRule.update({ where: { id }, data });

  await prisma.auditEvent.create({
    data: {
      entityType: "ApprovalRule",
      entityId: id,
      action: "UPDATED",
      actorId: user.id,
      reason: `Updated approval rule "${data.name}"`,
      payload: data,
    },
  });

  revalidatePath("/admin/approval-rules");
}

export async function deleteApprovalRule(id: string) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const deleted = await prisma.approvalRule.delete({ where: { id } });

  await prisma.auditEvent.create({
    data: {
      entityType: "ApprovalRule",
      entityId: id,
      action: "DELETED",
      actorId: user.id,
      reason: `Deleted approval rule "${deleted.name}"`,
    },
  });

  revalidatePath("/admin/approval-rules");
}
