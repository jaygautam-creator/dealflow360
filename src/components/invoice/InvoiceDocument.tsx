import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export interface InvoiceLine {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxPct: number;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
}
export interface InvoicePayment {
  amount: number;
  method: string;
  paidAt: string;
}
export interface InvoiceData {
  number: string;
  type: string;
  status: string;
  subtotal: number;
  discountTotal: number;
  taxableValue: number;
  taxTotal: number;
  amount: number;
  paid: number;
  invoiceDate: string;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  orderNumber: string;
  quotationNumber: string;
  customer: { name: string; email?: string; city: string | null; country: string | null };
  lines: InvoiceLine[];
  payments: InvoicePayment[];
}

function money(rupees: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(rupees);
}
function date(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** The seller's own details, as they'd appear on any invoice this business issues. */
const SELLER = {
  name: "DealFlow360 Pvt. Ltd.",
  address: "4th Floor, Prestige Tech Park, Bengaluru, Karnataka 560103, India",
  gstin: "29AACCD1234F1Z5",
  email: "billing@dealflow360.example",
};

export function InvoiceDocument({ invoice, footer }: { invoice: InvoiceData; footer?: ReactNode }) {
  const balance = invoice.amount - invoice.paid;
  const settled = invoice.status === "PAID" || invoice.status === "CREDITED";
  const singleTaxRate = invoice.lines.every((l) => l.taxPct === invoice.lines[0]?.taxPct)
    ? invoice.lines[0]?.taxPct
    : null;

  return (
    <Card className="print:border-none print:shadow-none">
      <CardContent className="space-y-6 p-6 sm:p-8 print:p-0">
        {/* Letterhead */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
          <div>
            <p className="text-lg font-bold tracking-tight">{SELLER.name}</p>
            <p className="max-w-xs text-xs text-neutral-500">{SELLER.address}</p>
            <p className="text-xs text-neutral-500">GSTIN: {SELLER.gstin}</p>
            <p className="text-xs text-neutral-500">{SELLER.email}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold tracking-tight">TAX INVOICE</p>
            <p className="mt-1 font-mono text-sm text-neutral-500">{invoice.number}</p>
            <div className="mt-2">
              <Badge tone={settled ? "success" : "warning"}>{invoice.status.toLowerCase()}</Badge>
            </div>
          </div>
        </div>

        {/* Parties + metadata */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Billed to</p>
            <p className="mt-1 font-medium text-neutral-900 dark:text-neutral-100">{invoice.customer.name}</p>
            {invoice.customer.email ? <p className="text-sm text-neutral-500">{invoice.customer.email}</p> : null}
            {invoice.customer.city || invoice.customer.country ? (
              <p className="text-sm text-neutral-500">
                {[invoice.customer.city, invoice.customer.country].filter(Boolean).join(", ")}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Invoice details</p>
            <dl className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between gap-4 sm:justify-start">
                <dt className="text-neutral-500">Date</dt>
                <dd className="sm:ml-2">{date(invoice.invoiceDate)}</dd>
              </div>
              {invoice.dueDate ? (
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-neutral-500">Due</dt>
                  <dd className="sm:ml-2">{date(invoice.dueDate)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 sm:justify-start">
                <dt className="text-neutral-500">Type</dt>
                <dd className="sm:ml-2">{invoice.type === "RECURRING" ? "Subscription" : "One-time"}</dd>
              </div>
              {invoice.periodStart && invoice.periodEnd ? (
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-neutral-500">Period</dt>
                  <dd className="sm:ml-2">
                    {date(invoice.periodStart)} – {date(invoice.periodEnd)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Reference</p>
            <dl className="mt-1 space-y-0.5 text-sm">
              <div className="flex justify-between gap-4 sm:justify-start">
                <dt className="text-neutral-500">Order</dt>
                <dd className="sm:ml-2 font-mono text-xs">{invoice.orderNumber}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:justify-start">
                <dt className="text-neutral-500">Quotation</dt>
                <dd className="sm:ml-2 font-mono text-xs">{invoice.quotationNumber}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Line items */}
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40">
                <th className="w-8 py-2 pl-3 font-normal">#</th>
                <th className="py-2 font-normal">Item</th>
                <th className="py-2 text-right font-normal">Qty</th>
                <th className="py-2 text-right font-normal">Unit price</th>
                <th className="py-2 text-right font-normal">Discount</th>
                <th className="py-2 text-right font-normal">Taxable value</th>
                <th className="py-2 text-right font-normal">Tax</th>
                <th className="py-2 pr-3 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, idx) => (
                <tr key={l.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                  <td className="py-2 pl-3 text-neutral-400">{idx + 1}</td>
                  <td className="py-2">{l.productName}</td>
                  <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{l.discountPct > 0 ? `${l.discountPct}%` : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.taxableValue)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {money(l.taxAmount)}
                    <span className="ml-1 text-xs text-neutral-400">({l.taxPct}%)</span>
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">{money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
            </div>
            {invoice.discountTotal > 0 ? (
              <div className="flex justify-between">
                <dt className="text-neutral-500">Discount</dt>
                <dd className="tabular-nums">− {money(invoice.discountTotal)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-neutral-500">Taxable value</dt>
              <dd className="tabular-nums">{money(invoice.taxableValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">
                GST{singleTaxRate !== null && singleTaxRate !== undefined ? ` (${singleTaxRate}%)` : ""}
              </dt>
              <dd className="tabular-nums">{money(invoice.taxTotal)}</dd>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-semibold dark:border-neutral-800">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(invoice.amount)}</dd>
            </div>
            <div className="flex justify-between pt-2 text-neutral-500">
              <dt>Paid</dt>
              <dd className="tabular-nums">{money(invoice.paid)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Balance due</dt>
              <dd className="tabular-nums">{money(balance)}</dd>
            </div>
          </dl>
        </div>

        {invoice.payments.length > 0 ? (
          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Payments received</p>
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

        <div className="border-t border-neutral-200 pt-4 text-xs text-neutral-400 dark:border-neutral-800">
          This is a system-generated tax invoice and does not require a signature.
        </div>

        {footer}
      </CardContent>
    </Card>
  );
}
