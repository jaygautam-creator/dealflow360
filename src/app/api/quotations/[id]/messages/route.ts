import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { postRepMessage } from "@/application/quotationService";

const MessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message.").max(2000),
});

/** The rep-side counterpart to /api/portal/quotations/[id]/messages: a plain reply into
    the same negotiation thread, not a counter-offer decision. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.QUOTATION_UPDATE);
    const { id } = await ctx.params;
    const { body } = MessageSchema.parse(await request.json());
    await postRepMessage(user, id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
