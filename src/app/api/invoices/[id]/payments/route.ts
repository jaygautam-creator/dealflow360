import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError, DomainError } from "@/app/api/_lib/respond";
import { recordPayment } from "@/application/paymentService";

const PaymentSchema = z.object({
  amount: z.number().positive("A payment must be greater than zero."),
  method: z.enum(["BANK", "CASH", "CARD", "UPI"]).optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserApi();
    // Recording money received is a finance action; a rep confirming their own order must
    // not also be able to mark it paid.
    if (!can(user.role, P.BILLING_MANAGE)) {
      throw new DomainError("Only finance can record a payment against an invoice.");
    }
    const { id } = await ctx.params;
    const input = PaymentSchema.parse(await request.json());
    return NextResponse.json(await recordPayment(id, input, user.id));
  } catch (error) {
    return apiError(error);
  }
}
