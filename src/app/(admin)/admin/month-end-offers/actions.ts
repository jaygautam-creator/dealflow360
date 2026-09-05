"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { prisma } from "@/infrastructure/db";
import { guardPromotionWrite } from "../_lib/authGuard";

/**
 * WHY THIS SCREEN EXISTS:
 * The month-end window and bonus were domain constants. Everything else a business tunes
 * in this system lives in a table — tier ceilings, category ceilings, approval bands, risk
 * weights — so a commercial lever hiding in code contradicted the rule the rest of the
 * system follows.
 *
 * The clamp is deliberately absent from this form. A bonus is always trimmed to the
 * product category's own ceiling, and that behaviour is not editable from anywhere. Raise
 * bonusDiscountPct to 90 and a Hardware line still stops at 15% — the promotion is a
 * lever, not a switch that turns discount governance off.
 */
const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  windowDays: z.coerce.number().int().min(1, "At least 1 day").max(28, "A window longer than 28 days is not a month-end offer"),
  bonusDiscountPct: z.coerce.number().min(0).max(100),
  maxGiftShareOfOrderPct: z.coerce.number().min(0).max(100),
  isActive: z.coerce.boolean(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    windowDays: formData.get("windowDays"),
    bonusDiscountPct: formData.get("bonusDiscountPct"),
    maxGiftShareOfOrderPct: formData.get("maxGiftShareOfOrderPct"),
    isActive: formData.get("isActive") === "true",
  });
}

export async function createMonthEndPromotion(formData: FormData) {
  const guardError = await guardPromotionWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const row = await tx.monthEndPromotion.create({ data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "MonthEndPromotion",
        entityId: row.id,
        action: "MONTH_END_PROMOTION_CREATED",
        actorId: user.id,
        reason: `Created "${row.name}": ${parsed.data.bonusDiscountPct}% bonus in the last ${parsed.data.windowDays} days`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/month-end-offers");
}

export async function updateMonthEndPromotion(id: string, formData: FormData) {
  const guardError = await guardPromotionWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const row = await tx.monthEndPromotion.update({ where: { id }, data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "MonthEndPromotion",
        entityId: id,
        action: "MONTH_END_PROMOTION_UPDATED",
        actorId: user.id,
        reason: `Updated "${row.name}": ${parsed.data.bonusDiscountPct}% bonus in the last ${parsed.data.windowDays} days, active ${parsed.data.isActive}`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/month-end-offers");
}

export async function deleteMonthEndPromotion(id: string) {
  const guardError = await guardPromotionWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  await prisma.$transaction(async (tx) => {
    const row = await tx.monthEndPromotion.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "MonthEndPromotion",
        entityId: id,
        action: "MONTH_END_PROMOTION_DELETED",
        actorId: user.id,
        // Deleting every row is a supported state, not a broken one: the engine falls
        // back to its tested defaults, so the offer keeps working on 7 days and 3%.
        reason: `Deleted month-end promotion "${row.name}"`,
      },
    });
  });

  revalidatePath("/admin/month-end-offers");
}
