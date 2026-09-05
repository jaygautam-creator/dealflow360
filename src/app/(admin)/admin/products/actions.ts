"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ProductKind } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";

const schema = z.object({
  sku: z.string().trim().min(1, "SKU is required"),
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  kind: z.enum(ProductKind),
  categoryId: z.string().min(1, "Category is required"),
  listPrice: z.coerce.number().min(0),
  cost: z.coerce.number().min(0),
  taxPct: z.coerce.number().min(0).max(100),
  uom: z.string().trim().min(1),
  isPromoted: z.coerce.boolean(),
  isActive: z.coerce.boolean(),
  defaultPlanId: z.string().optional(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    kind: formData.get("kind"),
    categoryId: formData.get("categoryId"),
    listPrice: formData.get("listPrice"),
    cost: formData.get("cost"),
    taxPct: formData.get("taxPct") || 18,
    uom: formData.get("uom") || "Unit",
    isPromoted: formData.has("isPromoted"),
    isActive: formData.has("isActive"),
    defaultPlanId: formData.get("defaultPlanId") || undefined,
  });
}

function toData(parsed: z.infer<typeof schema>) {
  return {
    sku: parsed.sku,
    name: parsed.name,
    description: parsed.description ?? null,
    kind: parsed.kind,
    categoryId: parsed.categoryId,
    listPrice: parsed.listPrice,
    cost: parsed.cost,
    taxPct: parsed.taxPct,
    uom: parsed.uom,
    isPromoted: parsed.isPromoted,
    isActive: parsed.isActive,
    defaultPlanId: parsed.defaultPlanId ?? null,
  };
}

export async function createProduct(formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.product.create({ data: toData(parsed.data) });
  revalidatePath("/admin/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.product.update({ where: { id }, data: toData(parsed.data) });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
}

export async function deleteProduct(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const lineCount = await prisma.quotationLine.count({ where: { productId: id } });
  if (lineCount > 0) {
    return { error: `Cannot delete: ${lineCount} quotation line(s) reference this product.` };
  }
  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin/products");
}
