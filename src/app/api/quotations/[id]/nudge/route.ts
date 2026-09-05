import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { scopedQuotationWhere } from "@/application/queries";
import { apiError } from "@/app/api/_lib/respond";
import { AuthError } from "@/infrastructure/auth/session";

const NudgeSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.DASHBOARD_VIEW);
    const { id } = await params;
    const input = NudgeSchema.parse(await request.json().catch(() => ({})));

    // Scoped the same way every other quotation read is: a rep must not be able to nudge
    // (or even discover) a deal outside their own visibility.
    const quotation = await prisma.quotation.findFirst({
      where: { AND: [{ id }, scopedQuotationWhere(user)] },
      select: { id: true, lastActivityAt: true },
    });
    if (!quotation) throw new AuthError("Not found or not visible to you.", 403);

    const stalledDays = Math.floor(
      (Date.now() - quotation.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // There is no email/notification service in this system, and faking one would be
    // dishonest about what this build actually does. A nudge is recorded as an auditable
    // event — a real deployment would hang an email or Slack notification off this event
    // rather than sending one directly from here.
    await prisma.auditEvent.create({
      data: {
        entityType: "Quotation",
        entityId: quotation.id,
        action: "NUDGE_SENT",
        actorId: user.id,
        reason: input.reason ?? null,
        payload: { stalledDays },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
