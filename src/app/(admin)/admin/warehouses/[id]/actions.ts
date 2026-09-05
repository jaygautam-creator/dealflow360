"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

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
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.stockLevel.findUnique({
    where: { warehouseId_productId: { warehouseId, productId: parsed.data.productId } },
  });
  if (existing) return { error: "This product already has a stock row in this warehouse." };

  await prisma.$transaction(async (tx) => {
    const stockLevel = await tx.stockLevel.create({ data: { warehouseId, ...parsed.data } });

    await tx.auditEvent.create({
      data: {
        entityType: "StockLevel",
        entityId: stockLevel.id,
        action: "STOCK_LEVEL_CREATED",
        actorId: user.id,
        reason: `Added stock level: quantity ${parsed.data.quantity}, reorder point ${parsed.data.reorderPoint}`,
        payload: { warehouseId, ...parsed.data },
      },
    });
  });

  revalidatePath(`/admin/warehouses/${warehouseId}`);
}

export async function updateStockLevel(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const stockLevel = await prisma.$transaction(async (tx) => {
    const stockLevel = await tx.stockLevel.update({
      where: { id },
      data: { quantity: parsed.data.quantity, reorderPoint: parsed.data.reorderPoint },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "StockLevel",
        entityId: id,
        action: "STOCK_LEVEL_UPDATED",
        actorId: user.id,
        reason: `Updated stock level to quantity ${parsed.data.quantity}, reorder point ${parsed.data.reorderPoint}`,
        payload: { quantity: parsed.data.quantity, reorderPoint: parsed.data.reorderPoint },
      },
    });

    return stockLevel;
  });

  revalidatePath(`/admin/warehouses/${stockLevel.warehouseId}`);
}

export async function deleteStockLevel(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const stockLevel = await prisma.$transaction(async (tx) => {
    const stockLevel = await tx.stockLevel.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "StockLevel",
        entityId: id,
        action: "STOCK_LEVEL_DELETED",
        actorId: user.id,
        reason: `Deleted stock level row`,
      },
    });

    return stockLevel;
  });

  revalidatePath(`/admin/warehouses/${stockLevel.warehouseId}`);
}
