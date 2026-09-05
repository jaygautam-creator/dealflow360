import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { scopedQuotationWhere } from "@/application/queries";
import { prisma } from "@/infrastructure/db";
import { dbToPaise } from "@/infrastructure/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import type { OrderStatus } from "@/generated/prisma";
import { OverrideForm } from "./OverrideForm";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

/**
 * Order detail — the "human overruling a machine" screen (spec B6).
 *
 * The planner's original trace stays visible even after a manual override, because the
 * whole point of the feature is showing what a person changed and why, not replacing the
 * machine's reasoning with silence.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage(P.FULFILLMENT_VIEW, "/workspace/orders");
  const { id } = await params;

  const order = await prisma.salesOrder.findFirst({
    where: { AND: [{ id }, { quotation: scopedQuotationWhere(user) }] },
    include: {
      quotation: {
        select: {
          id: true,
          number: true,
          total: true,
          customer: { select: { name: true } },
          lines: { select: { id: true, quantity: true, product: { select: { id: true, name: true } } } },
        },
      },
      fulfillmentPlan: {
        include: {
          allocations: {
            include: { product: { select: { id: true, name: true } }, warehouse: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const canOverride = can(user.role, P.FULFILLMENT_OVERRIDE) && order.status !== "FULFILLED" && order.status !== "CANCELLED";

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    include: { stockLevels: { select: { productId: true, quantity: true } } },
  });

  const trace = (order.fulfillmentPlan?.planTrace as
    | { warehouseId: string; warehouseName: string; coveredUnits: number; reason: string }[]
    | null) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.number}
        subtitle={`${order.quotation.customer.name} · ${money(dbToPaise(order.quotation.total))}`}
      />

      <div className="flex items-center gap-2">
        <Badge tone={orderStatusTone(order.status)}>{order.status.replaceAll("_", " ").toLowerCase()}</Badge>
        {order.fulfillmentPlan?.isManualOverride && <Badge tone="info">Manually overridden</Badge>}
        <Link href={`/workspace/quotations/${order.quotation.id}`} className="text-xs font-medium text-indigo-600 hover:underline">
          View quotation
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current allocation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Warehouse</TH>
                <TH className="text-right">Quantity</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {(order.fulfillmentPlan?.allocations.length ?? 0) === 0 ? (
                <TR>
                  <TD colSpan={4} className="text-center text-neutral-400">
                    No allocation on record.
                  </TD>
                </TR>
              ) : (
                order.fulfillmentPlan!.allocations.map((a) => (
                  <TR key={a.id}>
                    <TD>{a.product.name}</TD>
                    <TD>{a.warehouse?.name ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{a.quantity}</TD>
                    <TD>{a.isBackorder ? <Badge tone="danger">Backorder</Badge> : <Badge tone="success">Allocated</Badge>}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {trace.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Planner&apos;s original reasoning</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-neutral-600">
              {trace.map((step, i) => (
                <li key={i}>
                  <span className="font-medium text-neutral-900">{step.warehouseName}</span> — {step.reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {order.fulfillmentPlan && canOverride && (
        <OverrideForm
          orderId={order.id}
          lines={order.quotation.lines.map((l) => ({ id: l.id, productId: l.product.id, productName: l.product.name, quantity: l.quantity }))}
          allocations={order.fulfillmentPlan.allocations.map((a) => ({
            lineId: a.lineId,
            productId: a.productId,
            warehouseId: a.warehouseId,
            quantity: a.quantity,
          }))}
          warehouses={warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            stockByProduct: Object.fromEntries(w.stockLevels.map((s) => [s.productId, s.quantity])),
          }))}
        />
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
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}
