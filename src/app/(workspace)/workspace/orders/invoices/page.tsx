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
import { cn } from "@/components/ui/cn";
import type { InvoiceStatus } from "@/generated/prisma";
import { RecordPaymentButton } from "./RecordPaymentButton";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const FILTERS = {
  all: { label: "All", statuses: undefined },
  unpaid: { label: "Unpaid", statuses: ["DRAFT", "OPEN"] as InvoiceStatus[] },
  paid: { label: "Paid", statuses: ["PAID", "CREDITED"] as InvoiceStatus[] },
} as const;
type FilterKey = keyof typeof FILTERS;

/**
 * Every invoice, filterable to what Finance actually watches: what's still owed. Scoped
 * through the order's quotation, same as every other quotation-derived read.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermissionPage(P.BILLING_MANAGE, "/workspace/orders/invoices");

  const { status } = await searchParams;
  const filterKey: FilterKey = status === "unpaid" || status === "paid" ? status : "all";
  const statuses = FILTERS[filterKey].statuses;

  const invoices = await prisma.invoice.findMany({
    where: {
      salesOrder: { quotation: scopedQuotationWhere(user) },
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: {
      salesOrder: { select: { number: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} in view`}
      />

      <div className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-100 p-1">
        {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
          <Link
            key={key}
            href={key === "all" ? "/workspace/orders/invoices" : `/workspace/orders/invoices?status=${key}`}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              filterKey === key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900",
            )}
          >
            {FILTERS[key].label}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState title="No invoices" description="Nothing matches this filter yet." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Number</TH>
                  <TH>Order</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Paid</TH>
                  <TH>Status</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.map((invoice) => {
                  const amountPaise = dbToPaise(invoice.amount);
                  const paidPaise = invoice.payments.reduce((sum, p) => sum + dbToPaise(p.amount), 0);
                  const outstandingPaise = amountPaise - paidPaise;
                  return (
                    <TR key={invoice.id}>
                      <TD className="font-mono text-xs font-medium">
                        <Link href={`/workspace/orders/invoices/${invoice.id}`} className="text-indigo-600 hover:underline">
                          {invoice.number}
                        </Link>
                      </TD>
                      <TD className="font-mono text-xs text-neutral-500">{invoice.salesOrder.number}</TD>
                      <TD>{invoice.type === "RECURRING" ? "Recurring" : "One-time"}</TD>
                      <TD className="text-right tabular-nums">{money(amountPaise)}</TD>
                      <TD className="text-right tabular-nums">{money(paidPaise)}</TD>
                      <TD>
                        <Badge tone={invoiceStatusTone(invoice.status)}>
                          {invoice.status.toLowerCase()}
                        </Badge>
                      </TD>
                      <TD className="text-xs text-neutral-500">
                        {invoice.dueDate
                          ? new Date(invoice.dueDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </TD>
                      <TD className="text-right">
                        {invoice.status !== "PAID" && invoice.status !== "CREDITED" && outstandingPaise > 0 ? (
                          <RecordPaymentButton
                            invoiceId={invoice.id}
                            invoiceNumber={invoice.number}
                            outstandingRupees={outstandingPaise / 100}
                          />
                        ) : (
                          <span className="text-xs text-neutral-400">Settled</span>
                        )}
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

function invoiceStatusTone(status: InvoiceStatus): BadgeTone {
  if (status === "PAID") return "success";
  if (status === "CREDITED") return "info";
  if (status === "OPEN") return "warning";
  return "neutral";
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    paise / 100,
  );
}
