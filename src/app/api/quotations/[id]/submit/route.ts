import { NextResponse, type NextRequest } from "next/server";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { submitForApproval } from "@/application/quotationService";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.QUOTATION_UPDATE);
    const { id } = await ctx.params;
    return NextResponse.json(await submitForApproval(id, user));
  } catch (error) {
    return apiError(error);
  }
}
