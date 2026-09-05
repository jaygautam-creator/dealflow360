"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { hashPassword, AuthError } from "@/infrastructure/auth/session";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";

const createPortalUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Creates a PORTAL-role user and binds it to the given customer.
 *
 * Security invariants — each one deliberate and named:
 *
 *   1. Role is hardcoded to "PORTAL" server-side. It is NOT read from the form.
 *      A client-supplied role would allow privilege escalation to ADMIN or any
 *      other role by crafting the POST body. Same reasoning as the signup route's
 *      "SALES_REP" hardcoding.
 *
 *   2. customerId comes from the server-side argument (the detail page URL parameter),
 *      not the form body. There is no <input name="customerId"> in the form, so an
 *      attacker cannot POST with a different customer's ID and create a portal user
 *      that sees that other customer's quotations.
 *
 *   3. Password is hashed with hashPassword() from src/infrastructure/auth/session —
 *      the exact function that the signup and login routes use. One hashing path means
 *      a future cost-factor change applies everywhere automatically.
 *
 *   4. Duplicate email returns { error: "..." } rather than a stack trace. Prisma's
 *      P2002 unique-constraint violation is caught and rewritten to a clean message.
 *
 *   5. AuditEvent is written in the same transaction. The password hash is NEVER
 *      included in the payload — only who created which portal user and when.
 */
export async function createPortalUser(customerId: string, formData: FormData) {
  // Auth: require CONFIG_MANAGE (same permission that guards the rest of the admin
  // customers screen). Done inline here because guardConfigManage() doesn't return
  // the user object, and we need the actor ID for the audit event.
  let actor;
  try {
    actor = await requireUserApi();
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  if (!can(actor.role, P.CONFIG_MANAGE)) {
    return { error: "You do not have permission to create portal users." };
  }

  const parsed = createPortalUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const email = parsed.data.email.toLowerCase().trim();
  const passwordHash = await hashPassword(parsed.data.password);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.data.name,
          email,
          passwordHash,
          // Role is hardcoded — see security note above.
          role: "PORTAL",
          // customerId is from the server argument, not the form — see security note above.
          customerId,
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: "User",
          entityId: user.id,
          action: "PORTAL_USER_CREATED",
          actorId: actor.id,
          reason: null,
          // password hash is NEVER written to the audit log
          payload: { customerId, email, name: user.name },
        },
      });
    });
  } catch (e: unknown) {
    // Prisma unique constraint on User.email — return a clean message, not a stack trace.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { error: "An account with that email already exists." };
    }
    throw e;
  }

  revalidatePath(`/admin/customers/${customerId}`);
}

/**
 * Sets a new password for any user. Requires USER_MANAGE (ADMIN only).
 *
 * An email-based token reset was deliberately not built — this project has no email
 * service, and a token link that goes nowhere is worse than being honest. Admin-set
 * passwords are auditable, immediate, and verifiable in the audit log. Every reset
 * records who did it and to whom; the password itself is never logged.
 */
export async function resetPortalUserPassword(userId: string, formData: FormData) {
  let actor;
  try {
    actor = await requireUserApi();
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  if (!can(actor.role, P.USER_MANAGE)) {
    return { error: "You do not have permission to reset passwords." };
  }

  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Confirm the target exists before spending bcrypt cycles.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, customerId: true },
  });
  if (!target) return { error: "User not found." };

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.auditEvent.create({
      data: {
        entityType: "User",
        entityId: userId,
        action: "PASSWORD_RESET",
        actorId: actor.id,
        reason: null,
        // password hash is NEVER in the audit payload — only who reset whose password
        payload: { resetBy: actor.id, targetUserId: userId },
      },
    });
  });

  revalidatePath(`/admin/customers/${target.customerId ?? ""}`);
}
