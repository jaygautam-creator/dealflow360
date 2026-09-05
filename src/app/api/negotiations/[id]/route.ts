import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { acceptCounterOffer, declineCounterOffer } from "@/application/portalService";

const RespondSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // Answering a counter-offer is an internal action: it changes price.
    const user = await requirePermissionApi(P.QUOTATION_UPDATE);
    const { id } = await ctx.params;
    const { action, reason } = RespondSchema.parse(await request.json());

    if (action === "ACCEPT") {
      return NextResponse.json(await acceptCounterOffer(id, user));
    }
    return NextResponse.json(
      await declineCounterOffer(id, user, reason ?? "The requested discount was not approved."),
    );
  } catch (error) {
    return apiError(error);
  }
}
