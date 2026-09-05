"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // Ceilings are entered as whole percentages (e.g. 15 for 15%) and stored as Decimal(5,2).
  maxDiscountPct: z.coerce.number().min(0).max(100),
});

function parse(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get("name"),
    maxDiscountPct: formData.get("maxDiscountPct"),
  });
}

export async function createCategory(formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const category = await tx.productCategory.create({ data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "ProductCategory",
        entityId: category.id,
        action: "CATEGORY_CREATED",
        actorId: user.id,
        reason: `Created category "${category.name}" with ${category.maxDiscountPct}% max discount`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    const category = await tx.productCategory.update({ where: { id }, data: parsed.data });

    await tx.auditEvent.create({
      data: {
        entityType: "ProductCategory",
        entityId: id,
        action: "CATEGORY_UPDATED",
        actorId: user.id,
        reason: `Updated category "${category.name}" max discount to ${parsed.data.maxDiscountPct}%`,
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/categories");
}

export async function deleteCategory(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    return { error: `Cannot delete: ${productCount} product(s) still use this category.` };
  }
  await prisma.$transaction(async (tx) => {
    const category = await tx.productCategory.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "ProductCategory",
        entityId: id,
        action: "CATEGORY_DELETED",
        actorId: user.id,
        reason: `Deleted category "${category.name}"`,
      },
    });
  });

  revalidatePath("/admin/categories");
}
