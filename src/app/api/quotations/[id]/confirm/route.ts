import { NextResponse, type NextRequest } from "next/server";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { confirmQuotation } from "@/application/confirmationService";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.QUOTATION_CONFIRM);
    const { id } = await ctx.params;
    return NextResponse.json(await confirmQuotation(id, user));
  } catch (error) {
    return apiError(error);
  }
}
