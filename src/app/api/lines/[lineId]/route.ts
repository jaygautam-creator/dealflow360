import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { removeLine, updateLine } from "@/application/lineService";
import { suggestionsFor } from "@/application/upsellService";
import { prisma } from "@/infrastructure/db";

const UpdateSchema = z
  .object({
    quantity: z.number().int().min(1).max(10_000).optional(),
    discountPct: z.number().min(0).max(100).optional(),
  })
  .refine((v) => v.quantity !== undefined || v.discountPct !== undefined, {
    message: "Provide a quantity or a discount to change.",
  });

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const user = await requirePermissionApi(P.QUOTATION_UPDATE);
    const { lineId } = await ctx.params;
    const input = UpdateSchema.parse(await request.json());

    const result = await updateLine(lineId, input, user);
    const line = await prisma.quotationLine.findUniqueOrThrow({
      where: { id: lineId },
      select: { quotationId: true },
    });
    return NextResponse.json({ ...result, suggestions: await suggestionsFor(line.quotationId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  try {
    const user = await requirePermissionApi(P.QUOTATION_UPDATE);
    const { lineId } = await ctx.params;
    // Captured before deletion, since the line is gone by the time we need its parent.
    const line = await prisma.quotationLine.findUniqueOrThrow({
      where: { id: lineId },
      select: { quotationId: true },
    });
    const result = await removeLine(lineId, user);
    return NextResponse.json({ ...result, suggestions: await suggestionsFor(line.quotationId) });
  } catch (error) {
    return apiError(error);
  }
}
