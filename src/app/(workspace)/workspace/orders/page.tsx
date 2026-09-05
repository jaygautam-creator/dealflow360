import Link from "next/link";
import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { scopedQuotationWhere } from "@/application/queries";
import { prisma } from "@/infrastructure/db";
import { dbToPaise } from "@/infrastructure/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import type { OrderStatus } from "@/generated/prisma";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

/**
 * Confirmed sales orders. Scoped through the same `scopedQuotationWhere` every other
 * quotation-derived read uses — a rep who cannot see a colleague's quotation must not be
 * able to see that quotation's order by walking a different URL.
 */
export default async function OrdersPage() {
  const user = await requirePermissionPage(P.FULFILLMENT_VIEW, "/workspace/orders");

  const orders = await prisma.salesOrder.findMany({
    where: { quotation: scopedQuotationWhere(user) },
    include: {
      quotation: { select: { id: true, number: true, total: true, customer: { select: { name: true } } } },
      fulfillmentPlan: { select: { shipmentCount: true, allocations: { select: { isBackorder: true } } } },
    },
    orderBy: { confirmedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle={`${orders.length} confirmed order${orders.length === 1 ? "" : "s"}`} />

      {orders.length === 0 ? (
        <EmptyState title="No confirmed orders" description="Orders appear here once a quotation is confirmed." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Number</TH>
                  <TH>Customer</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Shipments</TH>
                  <TH>Backorder</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {orders.map((order) => {
                  const hasBackorder = order.fulfillmentPlan?.allocations.some((a) => a.isBackorder) ?? false;
                  return (
                    <TR key={order.id}>
                      <TD>
                        <Link
                          href={`/workspace/quotations/${order.quotation.id}`}
                          className="font-mono text-xs font-medium text-indigo-600 hover:underline"
                        >
                          {order.number}
                        </Link>
                      </TD>
                      <TD>{order.quotation.customer.name}</TD>
                      <TD>
                        <Badge tone={orderStatusTone(order.status)}>
                          {order.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {order.fulfillmentPlan?.shipmentCount ?? "—"}
                      </TD>
                      <TD>
                        {hasBackorder ? (
                          <Badge tone="danger">Backorder</Badge>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </TD>
                      <TD className="text-right font-medium tabular-nums">
                        {money(dbToPaise(order.quotation.total))}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function orderStatusTone(status: OrderStatus): BadgeTone {
  if (status === "FULFILLED") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "PARTIALLY_FULFILLED") return "warning";
  return "info";
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    paise / 100,
  );
}
