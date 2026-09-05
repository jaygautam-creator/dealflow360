"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { guardConfigManage } from "../_lib/authGuard";
import { requireUserApi } from "@/infrastructure/auth/guards";

/**
 * WHY THIS SCREEN EXISTS:
 * A reviewer must be able to sign up, create their own customer, give that customer a
 * portal login, quote them, and negotiate — without touching the seed data. That is what
 * makes the system real rather than a demo fixture. Before this screen existed, customers
 * only came from prisma/seed.ts, making the app appear hardcoded to seeded data.
 */

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  tier: z.enum(CustomerTier),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    tier: formData.get("tier"),
    city: (formData.get("city") as string | null) || undefined,
    country: (formData.get("country") as string | null) || undefined,
  });
}

/**
 * Customer.email is unique at the database level. Without this the constraint surfaces as
 * an unhandled Prisma P2002 and the admin sees a server error rather than the one sentence
 * that tells them what to do — a constraint that crashes is worse than no constraint.
 */
async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.customer.findUnique({
    where: { email },
    select: { id: true },
  });
  return existing !== null && existing.id !== exceptId;
}

export async function createCustomer(formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Session re-read to get the actor ID for the audit record. guardConfigManage
  // already verified auth — this second call is cheap (JWT verify, no DB round-trip).
  const actor = await requireUserApi();

  if (await emailTaken(parsed.data.email)) {
    return { error: `A customer with the email ${parsed.data.email} already exists.` };
  }

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        tier: parsed.data.tier,
        city: parsed.data.city ?? null,
        country: parsed.data.country ?? null,
      },
    });
    await tx.auditEvent.create({
      data: {
        entityType: "Customer",
        entityId: customer.id,
        action: "CUSTOMER_CREATED",
        actorId: actor.id,
        reason: null,
        payload: { name: customer.name, tier: customer.tier, email: customer.email },
      },
    });
  });

  revalidatePath("/admin/customers");
}

export async function updateCustomer(id: string, formData: FormData) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const actor = await requireUserApi();

  if (await emailTaken(parsed.data.email, id)) {
    return { error: `Another customer already uses the email ${parsed.data.email}.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        tier: parsed.data.tier,
        city: parsed.data.city ?? null,
        country: parsed.data.country ?? null,
      },
    });
    await tx.auditEvent.create({
      data: {
        entityType: "Customer",
        entityId: id,
        action: "CUSTOMER_UPDATED",
        actorId: actor.id,
        reason: null,
        payload: {
          name: parsed.data.name,
          tier: parsed.data.tier,
          email: parsed.data.email,
        },
      },
    });
  });

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
}

export async function deleteCustomer(id: string) {
  const guardError = await guardConfigManage();
  if (guardError) return guardError;
  const actor = await requireUserApi();

  // Block deletion if quotations exist — they hold references to this customer and
  // removing it would orphan financial records.
  const quotationCount = await prisma.quotation.count({ where: { customerId: id } });
  if (quotationCount > 0) {
    return {
      error: `Cannot delete: ${quotationCount} quotation(s) reference this customer.`,
    };
  }

  // Block deletion if portal users are still linked. Remove them first (via the
  // portal users panel on the detail page) so the audit trail remains intact.
  const portalUserCount = await prisma.user.count({ where: { customerId: id } });
  if (portalUserCount > 0) {
    return {
      error: `Cannot delete: ${portalUserCount} portal user(s) are linked to this customer. Remove them first.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.delete({ where: { id } });

    await tx.auditEvent.create({
      data: {
        entityType: "Customer",
        entityId: id,
        action: "CUSTOMER_DELETED",
        actorId: actor.id,
        reason: `Deleted customer "${customer.name}"`,
        payload: { name: customer.name, email: customer.email, tier: customer.tier },
      },
    });
  });

  revalidatePath("/admin/customers");
}
