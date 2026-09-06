"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvoiceDocument, type InvoiceData } from "@/components/invoice/InvoiceDocument";

export function PortalInvoice({ invoice }: { invoice: InvoiceData }) {
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

      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
