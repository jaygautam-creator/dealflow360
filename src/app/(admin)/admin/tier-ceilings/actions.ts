"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { guardConfigWrite } from "../_lib/authGuard";

const schema = z.object({
  tier: z.enum(CustomerTier),
  maxDiscountPct: z.coerce.number().min(0).max(100),
});

function parse(formData: FormData) {
  return schema.safeParse({
    tier: formData.get("tier"),
    maxDiscountPct: formData.get("maxDiscountPct"),
  });
}

// Ceilings are one row per tier (tier is @unique), so create/update both resolve to an
// upsert keyed on tier — there is no independent id the form needs to track.
export async function createTierCeiling(formData: FormData) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const row = await tx.tierDiscountCeiling.upsert({
      where: { tier: parsed.data.tier },
      create: parsed.data,
      update: { maxDiscountPct: parsed.data.maxDiscountPct },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "TierDiscountCeiling",
        entityId: row.id,
        action: "UPSERTED",
        actorId: user.id,
        reason: `Configured max discount ceiling for tier ${parsed.data.tier}`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/tier-ceilings");
}

export async function updateTierCeiling(id: string, formData: FormData) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    await tx.tierDiscountCeiling.update({
      where: { id },
      data: { maxDiscountPct: parsed.data.maxDiscountPct },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "TierDiscountCeiling",
        entityId: id,
        action: "UPDATED",
        actorId: user.id,
        reason: `Updated max discount ceiling to ${parsed.data.maxDiscountPct}%`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/tier-ceilings");
}

export async function deleteTierCeiling(id: string) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.tierDiscountCeiling.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "TierDiscountCeiling",
        entityId: id,
        action: "DELETED",
        actorId: user.id,
        reason: `Deleted tier discount ceiling for tier ${deleted.tier}`,
      },
    });
  });

  revalidatePath("/admin/tier-ceilings");
}
