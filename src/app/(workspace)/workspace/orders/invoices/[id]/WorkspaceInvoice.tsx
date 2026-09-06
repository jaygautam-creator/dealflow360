"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvoiceDocument, type InvoiceData } from "@/components/invoice/InvoiceDocument";
import { RecordPaymentButton } from "../RecordPaymentButton";

export function WorkspaceInvoice({
  invoice,
}: {
  invoice: InvoiceData & { id: string; repName: string; repEmail: string };
}) {
  const balance = invoice.amount - invoice.paid;
  const settled = invoice.status === "PAID" || invoice.status === "CREDITED";

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{invoice.number}</h1>
          <p className="text-sm text-neutral-500">
            Order {invoice.orderNumber} · Quotation {invoice.quotationNumber} · Rep {invoice.repName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!settled && balance > 0 ? (
            <RecordPaymentButton invoiceId={invoice.id} invoiceNumber={invoice.number} outstandingRupees={balance} />
          ) : null}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
