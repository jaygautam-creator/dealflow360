"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";

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
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.productCategory.create({ data: parsed.data });
  revalidatePath("/admin/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.productCategory.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/categories");
}

export async function deleteCategory(id: string) {
  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    return { error: `Cannot delete: ${productCount} product(s) still use this category.` };
  }
  await prisma.productCategory.delete({ where: { id } });
  revalidatePath("/admin/categories");
}
