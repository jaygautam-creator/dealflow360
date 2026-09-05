import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { addLine } from "@/application/lineService";
import { suggestionsFor } from "@/application/upsellService";

const AddLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullable().optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(10_000),
  // The upper bound is a sanity guard, not the policy — the policy is the risk engine.
  discountPct: z.number().min(0, "Discount cannot be negative.").max(100),
  fromUpsell: z.boolean().optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.QUOTATION_UPDATE);
    const { id } = await ctx.params;
    const input = AddLineSchema.parse(await request.json());

    const result = await addLine(id, input, user.id);
    return NextResponse.json({ ...result, suggestions: await suggestionsFor(id) });
  } catch (error) {
    return apiError(error);
  }
}

/** Live upsell suggestions for the quotation as it currently stands. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermissionApi(P.QUOTATION_UPDATE);
    const { id } = await ctx.params;
    return NextResponse.json({ suggestions: await suggestionsFor(id) });
  } catch (error) {
    return apiError(error);
  }
}
