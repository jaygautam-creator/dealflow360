"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../../_lib/authGuard";

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

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.priceListItem.findUnique({
    where: { priceListId_productId: { priceListId, productId: parsed.data.productId } },
  });
  if (existing) return { error: "This product already has a price on this list." };

  await prisma.priceListItem.create({ data: { priceListId, ...parsed.data } });
  revalidatePath(`/admin/price-lists/${priceListId}`);
}

export async function updatePriceListItem(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const item = await prisma.priceListItem.update({
    where: { id },
    data: { price: parsed.data.price },
  });
  revalidatePath(`/admin/price-lists/${item.priceListId}`);
}

export async function deletePriceListItem(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const item = await prisma.priceListItem.delete({ where: { id } });
  revalidatePath(`/admin/price-lists/${item.priceListId}`);
}
