import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { apiError } from "@/app/api/_lib/respond";
import { expiryFor } from "@/domain/auth/passwordReset";
import {
  deliverPasswordReset,
  generateResetToken,
  hashResetToken,
} from "@/infrastructure/auth/passwordReset";

const Schema = z.object({ email: z.string().trim().email() });

/**
 * Request a password reset.
 *
 * ALWAYS RETURNS THE SAME THING. Whether the address belongs to an account, belongs to a
 * deactivated account, or belongs to nobody, the response and the status are identical.
 * This endpoint is unauthenticated, so any difference between those cases turns it into a
 * free tool for discovering who holds an account — the same reason the login route already
 * answers "wrong password" and "no such user" identically.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = Schema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, isActive: true },
    });

    if (user && user.isActive) {
      const token = generateResetToken();
      const now = new Date();
      const expiresAt = expiryFor(now);

      await prisma.$transaction(async (tx) => {
        // Requesting a new link retires every outstanding one. Without this, a link mailed
        // to an address the user no longer controls stays live until it expires on its own.
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        });

        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt,
            requestedIp:
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: "User",
            entityId: user.id,
            action: "PASSWORD_RESET_REQUESTED",
            // Nobody is signed in, so the subject is the actor.
            actorId: user.id,
            reason: "A password reset link was issued",
            payload: { expiresAt: expiresAt.toISOString() },
          },
        });
      });

      const origin = request.nextUrl.origin;
      deliverPasswordReset({
        email: user.email,
        name: user.name,
        url: `${origin}/reset-password?token=${encodeURIComponent(token)}`,
        expiresAt,
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        "If that address belongs to an account, a reset link has been sent. It is valid for 30 minutes.",
    });
  } catch (error) {
    return apiError(error);
  }
}
