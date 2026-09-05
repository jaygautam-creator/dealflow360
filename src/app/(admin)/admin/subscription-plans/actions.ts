"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingInterval } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  interval: z.enum(BillingInterval),
  prorateOnChange: z.coerce.boolean(),
  refundPctOnCancel: z.coerce.number().min(0).max(100),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    interval: formData.get("interval"),
    prorateOnChange: formData.has("prorateOnChange"),
    refundPctOnCancel: formData.get("refundPctOnCancel") || 100,
  });
}

export async function createSubscriptionPlan(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.subscriptionPlan.create({ data: parsed.data });
  revalidatePath("/admin/subscription-plans");
}

export async function updateSubscriptionPlan(id: string, formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.subscriptionPlan.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/subscription-plans");
}

export async function deleteSubscriptionPlan(id: string) {
  const productCount = await prisma.product.count({ where: { defaultPlanId: id } });
  if (productCount > 0) {
    return { error: `Cannot delete: ${productCount} product(s) default to this plan.` };
  }
  await prisma.subscriptionPlan.delete({ where: { id } });
  revalidatePath("/admin/subscription-plans");
}
