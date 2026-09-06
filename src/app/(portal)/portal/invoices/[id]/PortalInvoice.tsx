"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface InvoiceLine {
  id: string; productName: string; quantity: number;
  unitPrice: number; discountPct: number; lineTotal: number;
}
interface InvoicePayment {
  amount: number; method: string; paidAt: string;
}

function money(rupees: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(rupees);
}
function date(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function PortalInvoice({
  invoice,
}: {
  invoice: {
    id: string; number: string; type: string; status: string; amount: number; paid: number;
    dueDate: string | null; periodStart: string | null; periodEnd: string | null;
    orderNumber: string; quotationNumber: string;
    customer: { name: string; city: string | null; country: string | null };
    lines: InvoiceLine[]; payments: InvoicePayment[];
  };
}) {
  const balance = invoice.amount - invoice.paid;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{invoice.number}</h1>
          <p className="text-sm text-neutral-500">Order {invoice.orderNumber} · Quotation {invoice.quotationNumber}</p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Print / Save as PDF
        </Button>
      </div>

      <Card className="print:border-none print:shadow-none">
        <CardHeader className="print:hidden">
          <CardTitle>Invoice</CardTitle>
          <Badge tone={invoice.status === "PAID" ? "success" : "warning"}>{invoice.status.toLowerCase()}</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="hidden print:block">
            <p className="text-lg font-semibold">Acme Corp Portal</p>
            <p className="mt-4 text-2xl font-bold">Invoice {invoice.number}</p>
          </div>

          <div className="flex flex-wrap justify-between gap-6 text-sm">
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-100">Billed to</p>
              <p className="text-neutral-500">{invoice.customer.name}</p>
              {invoice.customer.city || invoice.customer.country ? (
                <p className="text-neutral-500">
                  {[invoice.customer.city, invoice.customer.country].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1 text-right">
              <p>
                <span className="text-neutral-500">Type: </span>
                {invoice.type === "RECURRING" ? "Subscription" : "One-time"}
              </p>
              {invoice.dueDate ? (
                <p><span className="text-neutral-500">Due: </span>{date(invoice.dueDate)}</p>
              ) : null}
              {invoice.periodStart && invoice.periodEnd ? (
                <p>
                  <span className="text-neutral-500">Period: </span>
                  {date(invoice.periodStart)} – {date(invoice.periodEnd)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                  <th className="py-2 font-normal">Item</th>
                  <th className="py-2 text-right font-normal">Qty</th>
                  <th className="py-2 text-right font-normal">Unit price</th>
                  <th className="py-2 text-right font-normal">Discount</th>
                  <th className="py-2 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                    <td className="py-2">{l.productName}</td>
                    <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                    <td className="py-2 text-right tabular-nums">{l.discountPct > 0 ? `${l.discountPct}%` : "—"}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto max-w-xs space-y-1 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Total</dt>
              <dd className="font-semibold tabular-nums">{money(invoice.amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Paid</dt>
              <dd className="tabular-nums">{money(invoice.paid)}</dd>
            </div>
            <div className="flex justify-between text-base">
              <dt className="font-medium">Balance due</dt>
              <dd className="font-semibold tabular-nums">{money(balance)}</dd>
            </div>
          </dl>

          {invoice.payments.length > 0 ? (
            <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <p className="mb-2 text-sm font-medium">Payments received</p>
              <div className="space-y-1 text-sm text-neutral-500">
                {invoice.payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{date(p.paidAt)} · {p.method.toLowerCase()}</span>
                    <span className="tabular-nums">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
