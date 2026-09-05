"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  tier: z.union([z.enum(CustomerTier), z.literal("")]).optional(),
  currency: z.string().trim().min(1, "Currency is required"),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    tier: formData.get("tier") || undefined,
    currency: formData.get("currency") || "INR",
  });
}

function toData(parsed: z.infer<typeof schema>) {
  return {
    name: parsed.name,
    tier: parsed.tier === "" || parsed.tier === undefined ? null : parsed.tier,
    currency: parsed.currency,
  };
}

export async function createPriceList(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = toData(parsed.data);
  // findUnique on the compound key can't take a null tier (Postgres treats each NULL as
  // distinct, so Prisma's generated type for this index requires a non-null value) — a
  // plain filtered lookup covers both the tiered and the null/default-list case.
  const existing = await prisma.priceList.findFirst({
    where: { tier: data.tier, currency: data.currency },
  });
  if (existing) {
    return { error: `A price list for ${data.tier ?? "default"}/${data.currency} already exists.` };
  }

  await prisma.priceList.create({ data });
  revalidatePath("/admin/price-lists");
}

export async function updatePriceList(id: string, formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.priceList.update({ where: { id }, data: toData(parsed.data) });
  revalidatePath("/admin/price-lists");
}

export async function deletePriceList(id: string) {
  await prisma.priceList.delete({ where: { id } });
  revalidatePath("/admin/price-lists");
}
