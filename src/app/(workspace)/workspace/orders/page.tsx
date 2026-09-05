import Link from "next/link";
import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { scopedQuotationWhere } from "@/application/queries";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, dbToPct } from "@/infrastructure/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { findConsolidationOpportunity } from "@/domain/fulfillment/planner";
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

  const [orders, warehouses] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { quotation: scopedQuotationWhere(user) },
      include: {
        quotation: { select: { id: true, number: true, total: true, customer: { select: { name: true } } } },
        fulfillmentPlan: {
          select: {
            shipmentCount: true,
            isManualOverride: true,
            allocations: {
              select: { lineId: true, productId: true, quantity: true, isBackorder: true, product: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { confirmedAt: "desc" },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      include: { stockLevels: { select: { productId: true, quantity: true } } },
    }),
  ]);

  // Read-only detection: if delayed stock now lets one warehouse cover every backorder
  // on an order, surface it — the spec asks for the prompt, not for the write that acts
  // on it yet (spec B6).
  const warehouseStock = warehouses.map((w) => ({
    warehouseId: w.id,
    warehouseCode: w.code,
    warehouseName: w.name,
    shippingCostWeight: dbToPct(w.shippingCostWeight),
    available: Object.fromEntries(w.stockLevels.map((s) => [s.productId, s.quantity])),
  }));

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
                  const rawAllocations = order.fulfillmentPlan?.allocations ?? [];
                  const hasBackorder = rawAllocations.some((a) => a.isBackorder);
                  const consolidation = hasBackorder
                    ? findConsolidationOpportunity(
                        rawAllocations.map((a) => ({
                          lineId: a.lineId,
                          productId: a.productId,
                          productName: a.product.name,
                          warehouseId: null,
                          warehouseName: null,
                          quantity: a.quantity,
                          isBackorder: a.isBackorder,
                        })),
                        warehouseStock,
                      )
                    : null;
                  return (
                    <TR key={order.id}>
                      <TD>
                        <Link
                          href={`/workspace/orders/${order.id}`}
                          className="font-mono text-xs font-medium text-indigo-600 hover:underline"
                        >
                          {order.number}
                        </Link>
                        {order.fulfillmentPlan?.isManualOverride && (
                          <Badge tone="info" className="ml-2">
                            Overridden
                          </Badge>
                        )}
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
                          <div className="space-y-1">
                            <Badge tone="danger">Backorder</Badge>
                            {consolidation && (
                              <p className="text-xs font-medium text-indigo-600" title={`${consolidation.warehouseName} can now cover every backordered line on this order.`}>
                                Consolidate Remaining Backorder — {consolidation.warehouseName}
                              </p>
                            )}
                          </div>
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
