"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../../_lib/authGuard";

const schema = z.object({
  attribute: z.string().trim().min(1, "Attribute is required"),
  value: z.string().trim().min(1, "Value is required"),
  extraPrice: z.coerce.number(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    attribute: formData.get("attribute"),
    value: formData.get("value"),
    extraPrice: formData.get("extraPrice") || 0,
  });
}

// productId is bound as the leading argument from the detail page.
export async function createVariant(productId: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.productVariant.findUnique({
    where: {
      productId_attribute_value: {
        productId,
        attribute: parsed.data.attribute,
        value: parsed.data.value,
      },
    },
  });
  if (existing) return { error: "This attribute/value combination already exists." };

  await prisma.productVariant.create({ data: { productId, ...parsed.data } });
  revalidatePath(`/admin/products/${productId}`);
}

export async function updateVariant(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const variant = await prisma.productVariant.update({
    where: { id },
    data: parsed.data,
  });
  revalidatePath(`/admin/products/${variant.productId}`);
}

export async function deleteVariant(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const variant = await prisma.productVariant.delete({ where: { id } });
  revalidatePath(`/admin/products/${variant.productId}`);
}
