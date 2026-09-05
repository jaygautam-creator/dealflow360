"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

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
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

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

  await prisma.$transaction(async (tx) => {
    const priceList = await tx.priceList.create({ data });

    await tx.auditEvent.create({
      data: {
        entityType: "PriceList",
        entityId: priceList.id,
        action: "PRICE_LIST_CREATED",
        actorId: user.id,
        reason: `Created price list "${priceList.name}" for ${priceList.tier ?? "default"} tier (${priceList.currency})`,
        payload: data,
      },
    });
  });

  revalidatePath("/admin/price-lists");
}

export async function updatePriceList(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = toData(parsed.data);
  await prisma.$transaction(async (tx) => {
    const priceList = await tx.priceList.update({ where: { id }, data });

    await tx.auditEvent.create({
      data: {
        entityType: "PriceList",
        entityId: id,
        action: "PRICE_LIST_UPDATED",
        actorId: user.id,
        reason: `Updated price list "${priceList.name}"`,
        payload: data,
      },
    });
  });

  revalidatePath("/admin/price-lists");
}

export async function deletePriceList(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  // Every other delete in the admin area counts its dependents first. Without this the
  // items cascade away silently, so a mistyped click destroys a whole tier's pricing with
  // nothing on screen to say it happened.
  const itemCount = await prisma.priceListItem.count({ where: { priceListId: id } });
  if (itemCount > 0) {
    return { error: `Cannot delete: ${itemCount} price item(s) belong to this list.` };
  }

  await prisma.$transaction(async (tx) => {
    const priceList = await tx.priceList.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "PriceList",
        entityId: id,
        action: "PRICE_LIST_DELETED",
        actorId: user.id,
        reason: `Deleted price list "${priceList.name}"`,
      },
    });
  });

  revalidatePath("/admin/price-lists");
}
