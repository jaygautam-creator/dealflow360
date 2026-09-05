"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../../_lib/authGuard";

const schema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().int().min(0),
  reorderPoint: z.coerce.number().int().min(0),
});

function parse(formData: FormData) {
  return schema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    reorderPoint: formData.get("reorderPoint") || 0,
  });
}

// warehouseId is bound as the leading argument from the detail page, matching the
// EntityManager (formData) => ... / (id, formData) => ... action signatures.
export async function createStockLevel(warehouseId: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.stockLevel.findUnique({
    where: { warehouseId_productId: { warehouseId, productId: parsed.data.productId } },
  });
  if (existing) return { error: "This product already has a stock row in this warehouse." };

  await prisma.stockLevel.create({ data: { warehouseId, ...parsed.data } });
  revalidatePath(`/admin/warehouses/${warehouseId}`);
}

export async function updateStockLevel(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const stockLevel = await prisma.stockLevel.update({
    where: { id },
    data: { quantity: parsed.data.quantity, reorderPoint: parsed.data.reorderPoint },
  });
  revalidatePath(`/admin/warehouses/${stockLevel.warehouseId}`);
}

export async function deleteStockLevel(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const stockLevel = await prisma.stockLevel.delete({ where: { id } });
  revalidatePath(`/admin/warehouses/${stockLevel.warehouseId}`);
}
