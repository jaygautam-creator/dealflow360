"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

const schema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(1, "Name is required"),
  shippingCostWeight: z.coerce.number().min(0),
  isActive: z.coerce.boolean(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    shippingCostWeight: formData.get("shippingCostWeight") || 1,
    isActive: formData.has("isActive"),
  });
}

export async function createWarehouse(formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.create({ data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "Warehouse",
        entityId: warehouse.id,
        action: "WAREHOUSE_CREATED",
        actorId: user.id,
        reason: `Created warehouse "${warehouse.name}" (${warehouse.code})`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/warehouses");
}

export async function updateWarehouse(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.update({ where: { id }, data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "Warehouse",
        entityId: id,
        action: "WAREHOUSE_UPDATED",
        actorId: user.id,
        reason: `Updated warehouse "${warehouse.name}" (${warehouse.code})`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/warehouses");
}

export async function deleteWarehouse(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const stockCount = await prisma.stockLevel.count({ where: { warehouseId: id } });
  if (stockCount > 0) {
    return { error: `Cannot delete: ${stockCount} stock level row(s) reference this warehouse.` };
  }
  await prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "Warehouse",
        entityId: id,
        action: "WAREHOUSE_DELETED",
        actorId: user.id,
        reason: `Deleted warehouse "${warehouse.name}" (${warehouse.code})`,
      },
    });
  });

  revalidatePath("/admin/warehouses");
}
