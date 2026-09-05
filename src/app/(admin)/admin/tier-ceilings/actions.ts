"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";

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
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.tierDiscountCeiling.upsert({
    where: { tier: parsed.data.tier },
    create: parsed.data,
    update: { maxDiscountPct: parsed.data.maxDiscountPct },
  });
  revalidatePath("/admin/tier-ceilings");
}

export async function updateTierCeiling(id: string, formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.tierDiscountCeiling.update({
    where: { id },
    data: { maxDiscountPct: parsed.data.maxDiscountPct },
  });
  revalidatePath("/admin/tier-ceilings");
}

export async function deleteTierCeiling(id: string) {
  await prisma.tierDiscountCeiling.delete({ where: { id } });
  revalidatePath("/admin/tier-ceilings");
}
