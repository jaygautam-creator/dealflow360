"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingInterval } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

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
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const plan = await tx.subscriptionPlan.create({ data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "SubscriptionPlan",
        entityId: plan.id,
        action: "SUBSCRIPTION_PLAN_CREATED",
        actorId: user.id,
        reason: `Created subscription plan "${plan.name}" (${plan.interval})`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/subscription-plans");
}

export async function updateSubscriptionPlan(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const plan = await tx.subscriptionPlan.update({ where: { id }, data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "SubscriptionPlan",
        entityId: id,
        action: "SUBSCRIPTION_PLAN_UPDATED",
        actorId: user.id,
        reason: `Updated subscription plan "${plan.name}" (${plan.interval})`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/subscription-plans");
}

export async function deleteSubscriptionPlan(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const productCount = await prisma.product.count({ where: { defaultPlanId: id } });
  if (productCount > 0) {
    return { error: `Cannot delete: ${productCount} product(s) default to this plan.` };
  }
  await prisma.$transaction(async (tx) => {
    const plan = await tx.subscriptionPlan.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "SubscriptionPlan",
        entityId: id,
        action: "SUBSCRIPTION_PLAN_DELETED",
        actorId: user.id,
        reason: `Deleted subscription plan "${plan.name}"`,
      },
    });
  });

  revalidatePath("/admin/subscription-plans");
}
