import { BillingInterval } from "@/generated/prisma";
import { dbToPct } from "@/infrastructure/money";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  updateSubscriptionPlan,
} from "./actions";

export const metadata = { title: "Subscription Plans" };

export default async function SubscriptionPlansPage() {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { name: "asc" } });

  const rows = plans.map((p) => ({
    id: p.id,
    name: p.name,
    interval: p.interval,
    prorateOnChange: p.prorateOnChange,
    refundPctOnCancel: String(dbToPct(p.refundPctOnCancel)),
  }));

  return (
    <EntityManager
      title="Subscription Plans"
      subtitle="Billing intervals and proration/refund policy for recurring lines. The billing engine reads these when a subscription starts, changes, or cancels."
      emptyLabel="No subscription plans yet"
      rows={rows}
      columns={[
        { key: "name", header: "Name" },
        { key: "interval", header: "Interval" },
        {
          key: "prorateOnChange",
          header: "Prorate on change",
          kind: "badge",
          toneMap: { true: "success", false: "neutral" },
          labelMap: { true: "Yes", false: "No" },
        },
        { key: "refundPctOnCancel", header: "Refund on cancel", kind: "percent" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        {
          name: "interval",
          label: "Billing interval",
          type: "select",
          required: true,
          options: Object.values(BillingInterval).map((v) => ({ value: v, label: v })),
        },
        {
          name: "prorateOnChange",
          label: "Charge only the unused remainder on mid-period change",
          type: "checkbox",
        },
        {
          name: "refundPctOnCancel",
          label: "Refund % of unused remainder on cancellation",
          type: "number",
          step: "0.01",
          required: true,
        },
      ]}
      createAction={createSubscriptionPlan}
      updateAction={updateSubscriptionPlan}
      deleteAction={deleteSubscriptionPlan}
    />
  );
}
