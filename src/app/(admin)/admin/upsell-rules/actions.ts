"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

const schema = z
  .object({
    triggerProductId: z.string().min(1, "Trigger product is required"),
    suggestedProductId: z.string().min(1, "Suggested product is required"),
    coPurchaseScore: z.coerce.number().min(0),
    minMarginPct: z.coerce.number().min(0).max(100),
  })
  .refine((d) => d.triggerProductId !== d.suggestedProductId, {
    message: "Trigger and suggested product must be different",
    path: ["suggestedProductId"],
  });

function parse(formData: FormData) {
  return schema.safeParse({
    triggerProductId: formData.get("triggerProductId"),
    suggestedProductId: formData.get("suggestedProductId"),
    coPurchaseScore: formData.get("coPurchaseScore") || 0,
    minMarginPct: formData.get("minMarginPct") || 0,
  });
}

export async function createUpsellRule(formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.upsellRule.findUnique({
    where: {
      triggerProductId_suggestedProductId: {
        triggerProductId: parsed.data.triggerProductId,
        suggestedProductId: parsed.data.suggestedProductId,
      },
    },
  });
  if (existing) return { error: "A rule for this product pair already exists." };

  await prisma.$transaction(async (tx) => {
    const rule = await tx.upsellRule.create({ data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "UpsellRule",
        entityId: rule.id,
        action: "UPSELL_RULE_CREATED",
        actorId: user.id,
        reason: `Created upsell rule (co-purchase score: ${parsed.data.coPurchaseScore}, min margin: ${parsed.data.minMarginPct}%)`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/upsell-rules");
}

export async function updateUpsellRule(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    await tx.upsellRule.update({ where: { id }, data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "UpsellRule",
        entityId: id,
        action: "UPSELL_RULE_UPDATED",
        actorId: user.id,
        reason: `Updated upsell rule (co-purchase score: ${parsed.data.coPurchaseScore}, min margin: ${parsed.data.minMarginPct}%)`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/upsell-rules");
}

export async function deleteUpsellRule(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  await prisma.$transaction(async (tx) => {
    await tx.upsellRule.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "UpsellRule",
        entityId: id,
        action: "UPSELL_RULE_DELETED",
        actorId: user.id,
        reason: `Deleted upsell rule`,
      },
    });
  });

  revalidatePath("/admin/upsell-rules");
}
