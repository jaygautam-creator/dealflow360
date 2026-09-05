import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { postNegotiation } from "@/application/portalService";

const MessageSchema = z.object({
  body: z.string().min(1, "Write a message.").max(2000),
  lineId: z.string().nullable().optional(),
  // A counter-offer is a request, not an instruction — the service records it and a
  // human decides. The bound here is a sanity check, not the pricing policy.
  requestedDiscountPct: z.number().min(0).max(100).nullable().optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.PORTAL_VIEW);
    const { id } = await ctx.params;
    const input = MessageSchema.parse(await request.json());
    return NextResponse.json(await postNegotiation(user, id, input));
  } catch (error) {
    return apiError(error);
  }
}
