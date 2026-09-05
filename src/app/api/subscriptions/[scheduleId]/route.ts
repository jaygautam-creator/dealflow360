import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import {
  SubscriptionError,
  cancelSubscription,
  changeSubscriptionQuantity,
} from "@/application/subscriptionService";

/**
 * Modify or cancel a recurring line (spec B7).
 *
 * Both live behind BILLING_MANAGE rather than QUOTATION_UPDATE. Changing a subscription
 * moves money that has already been invoiced — it raises credit notes and prorated
 * invoices — so it belongs to finance, not to whoever happens to own the quotation. A rep
 * who can edit a draft must not be able to refund a customer.
 *
 * One route with an explicit `action` rather than two sibling routes: the two operations
 * share their loading, scoping and audit path entirely, and splitting them would duplicate
 * that for no gain.
 */

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CHANGE_QUANTITY"),
    newQuantity: z.number().int().min(1).max(100000),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("CANCEL"),
    reason: z.string().trim().min(5, "A cancellation reason is required").max(500),
  }),
]);

export async function POST(request: NextRequest, context: { params: Promise<{ scheduleId: string }> }) {
  try {
    const user = await requirePermissionApi(P.BILLING_MANAGE);
    const { scheduleId } = await context.params;
    const body = BodySchema.parse(await request.json());

    const result =
      body.action === "CANCEL"
        ? await cancelSubscription(user, scheduleId, body.reason)
        : await changeSubscriptionQuantity(user, scheduleId, body.newQuantity, body.reason ?? null);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiError(error);
  }
}
