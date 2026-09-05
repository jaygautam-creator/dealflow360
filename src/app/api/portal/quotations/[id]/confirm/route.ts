import { NextResponse, type NextRequest } from "next/server";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { confirmPortalQuotation } from "@/application/confirmationService";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.PORTAL_VIEW);
    const { id } = await ctx.params;
    const result = await confirmPortalQuotation(id, user);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
