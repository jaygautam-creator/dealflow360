"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";

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

  await prisma.upsellRule.create({ data: parsed.data });
  revalidatePath("/admin/upsell-rules");
}

export async function updateUpsellRule(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.upsellRule.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/upsell-rules");
}

export async function deleteUpsellRule(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  await prisma.upsellRule.delete({ where: { id } });
  revalidatePath("/admin/upsell-rules");
}
