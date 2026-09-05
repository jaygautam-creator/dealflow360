"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";

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
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.approvalRule.create({ data: toData(parsed.data) });
  revalidatePath("/admin/approval-rules");
}

export async function updateApprovalRule(id: string, formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.approvalRule.update({ where: { id }, data: toData(parsed.data) });
  revalidatePath("/admin/approval-rules");
}

export async function deleteApprovalRule(id: string) {
  await prisma.approvalRule.delete({ where: { id } });
  revalidatePath("/admin/approval-rules");
}
