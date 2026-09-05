import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { scopedQuotationWhere } from "@/application/queries";
import { prisma } from "@/infrastructure/db";
import { dbToPaise } from "@/infrastructure/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import type { ScheduleStatus } from "@/generated/prisma";
import { SubscriptionActions } from "./SubscriptionActions";

export const metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

/**
 * The forward billing calendar: one row per recurring line. Scoped through the order's
 * quotation, same as orders and invoices.
 */
export default async function SubscriptionsPage() {
  const user = await requirePermissionPage(P.FULFILLMENT_VIEW, "/workspace/orders/subscriptions");

  const schedules = await prisma.billingSchedule.findMany({
    where: { salesOrder: { quotation: scopedQuotationWhere(user) } },
    include: {
      salesOrder: { select: { quotation: { select: { customer: { select: { name: true } } } } } },
      line: { select: { quantity: true, product: { select: { name: true } } } },
      plan: { select: { name: true } },
    },
    orderBy: { nextBillingDate: "asc" },
  });

  const mayManageBilling = can(user.role, P.BILLING_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle={`${schedules.length} billing schedule${schedules.length === 1 ? "" : "s"}`}
      />

      {schedules.length === 0 ? (
        <EmptyState
          title="No subscriptions"
          description="Recurring lines open a billing schedule once their order is confirmed."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Product</TH>
                  <TH>Plan</TH>
                  <TH>Interval</TH>
                  <TH className="text-right">Per period</TH>
                  <TH>Next billing</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {schedules.map((s) => (
                  <TR key={s.id}>
                    <TD>{s.salesOrder.quotation.customer.name}</TD>
                    <TD>{s.line.product.name}</TD>
                    <TD>{s.plan.name}</TD>
                    <TD>{s.interval.toLowerCase()}</TD>
                    <TD className="text-right tabular-nums">{money(dbToPaise(s.amountPerPeriod))}</TD>
                    <TD className="text-xs text-neutral-500">
                      {new Date(s.nextBillingDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TD>
                    <TD>
                      <Badge tone={scheduleStatusTone(s.status)}>{s.status.toLowerCase()}</Badge>
                    </TD>
                    <TD className="text-right">
                      {s.status === "ACTIVE" && mayManageBilling ? (
                        <SubscriptionActions
                          scheduleId={s.id}
                          currentQuantity={s.line.quantity}
                          productName={s.line.product.name}
                        />
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function scheduleStatusTone(status: ScheduleStatus): BadgeTone {
  if (status === "ACTIVE") return "success";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    paise / 100,
  );
}
