"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

const schema = z.object({
  productId: z.string().min(1, "Product is required"),
  price: z.coerce.number().min(0),
});

function parse(formData: FormData) {
  return schema.safeParse({
    productId: formData.get("productId"),
    price: formData.get("price"),
  });
}

// priceListId is bound as the leading argument from the detail page.
export async function createPriceListItem(priceListId: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.priceListItem.findUnique({
    where: { priceListId_productId: { priceListId, productId: parsed.data.productId } },
  });
  if (existing) return { error: "This product already has a price on this list." };

  await prisma.$transaction(async (tx) => {
    const item = await tx.priceListItem.create({ data: { priceListId, ...parsed.data } });

    await tx.auditEvent.create({
      data: {
        entityType: "PriceListItem",
        entityId: item.id,
        action: "PRICE_LIST_ITEM_CREATED",
        actorId: user.id,
        reason: `Added product price item (${parsed.data.price})`,
        payload: { priceListId, ...parsed.data },
      },
    });
  });

  revalidatePath(`/admin/price-lists/${priceListId}`);
}

export async function updatePriceListItem(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const item = await prisma.$transaction(async (tx) => {
    const item = await tx.priceListItem.update({
      where: { id },
      data: { price: parsed.data.price },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "PriceListItem",
        entityId: id,
        action: "PRICE_LIST_ITEM_UPDATED",
        actorId: user.id,
        reason: `Updated price list item price to ${parsed.data.price}`,
        payload: { price: parsed.data.price },
      },
    });

    return item;
  });

  revalidatePath(`/admin/price-lists/${item.priceListId}`);
}

export async function deletePriceListItem(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const item = await prisma.$transaction(async (tx) => {
    const item = await tx.priceListItem.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "PriceListItem",
        entityId: id,
        action: "PRICE_LIST_ITEM_DELETED",
        actorId: user.id,
        reason: `Deleted item from price list`,
      },
    });

    return item;
  });

  revalidatePath(`/admin/price-lists/${item.priceListId}`);
}
