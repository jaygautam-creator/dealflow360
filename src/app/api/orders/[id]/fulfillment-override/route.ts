import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { overrideFulfillment } from "@/application/fulfillmentService";

const OverrideSchema = z.object({
  reason: z.string().min(5, "Reason must be at least 5 characters.").max(1000),
  allocations: z
    .array(
      z.object({
        lineId: z.string().min(1, "lineId is required"),
        warehouseId: z.string().nullable(),
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
      }),
    )
    .min(1, "At least one allocation is required."),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.FULFILLMENT_OVERRIDE);
    const { id } = await ctx.params;
    const body = await request.json();
    const input = OverrideSchema.parse(body);

    const result = await overrideFulfillment(id, user, input);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
