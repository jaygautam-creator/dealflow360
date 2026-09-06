import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { apiError, DomainError } from "@/app/api/_lib/respond";
import { checkNewPassword, checkToken } from "@/domain/auth/passwordReset";
import { hashResetToken } from "@/infrastructure/auth/passwordReset";
import { hashPassword } from "@/infrastructure/auth/session";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  confirmation: z.string().min(1),
});

/**
 * Spend a reset token and set a new password.
 *
 * The token is looked up by digest, never by id, so the value in the URL is the only thing
 * that opens it and the database never holds anything that could be replayed.
 *
 * Marking the token spent and writing the new password happen in ONE transaction. Split
 * across two, a failure between them either burns a token without changing the password —
 * locking the user out of their own reset — or changes the password while leaving the link
 * live for whoever else may hold it.
 */
export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json());

    const passwordVerdict = checkNewPassword(input.password, input.confirmation);
    if (!passwordVerdict.acceptable) throw new DomainError(passwordVerdict.reason);

    const now = new Date();
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(input.token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { email: true, isActive: true } },
      },
    });

    const verdict = checkToken(
      record ? { expiresAt: record.expiresAt, usedAt: record.usedAt } : null,
      now,
    );
    if (!verdict.usable || !record) throw new DomainError(verdict.usable ? "" : verdict.reason);

    // A deactivated account must not be reachable by resetting its password. Same refusal
    // wording, so this does not become a way to probe which accounts are disabled.
    if (!record.user.isActive) {
      throw new DomainError("This reset link is no longer valid. Request a new one.");
    }

    const passwordHash = await hashPassword(input.password);

    await prisma.$transaction(async (tx) => {
      // Guarded on usedAt being null so two simultaneous submissions of the same link
      // cannot both succeed — the second updates zero rows and is refused below.
      const spent = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (spent.count !== 1) {
        throw new DomainError("This reset link is no longer valid. Request a new one.");
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      // Any other outstanding link is retired too: the account has just changed hands.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });

      await tx.auditEvent.create({
        data: {
          entityType: "User",
          entityId: record.userId,
          action: "PASSWORD_RESET_COMPLETED",
          actorId: record.userId,
          reason: "Password changed using a reset link",
        },
      });
    });

    return NextResponse.json({ ok: true, email: record.user.email });
  } catch (error) {
    return apiError(error);
  }
}
