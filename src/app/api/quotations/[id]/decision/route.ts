import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError, DomainError } from "@/app/api/_lib/respond";
import { approveStep, rejectStep, returnForRevision } from "@/application/approvalService";

const DecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "RETURN"]),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserApi();
    const { id } = await ctx.params;
    const { action, reason } = DecisionSchema.parse(await request.json());

    // Holding either approval permission is enough to reach this route; the service then
    // decides whether this specific principal may clear this specific step.
    if (!can(user.role, P.APPROVE_AS_MANAGER) && !can(user.role, P.APPROVE_AS_FINANCE)) {
      throw new DomainError("Your role cannot act on approvals.");
    }

    const actor = { id: user.id, role: user.role };
    switch (action) {
      case "APPROVE":
        return NextResponse.json(await approveStep(id, actor, reason));
      case "REJECT":
        return NextResponse.json(await rejectStep(id, actor, reason ?? ""));
      case "RETURN":
        return NextResponse.json(await returnForRevision(id, actor, reason ?? ""));
    }
  } catch (error) {
    return apiError(error);
  }
}
