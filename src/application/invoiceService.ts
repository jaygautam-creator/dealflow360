import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, paiseToDb, dbToPct } from "@/infrastructure/money";
import { applyPct } from "@/domain/shared/money";
import { netLineTotal } from "@/domain/upsell/recommend";
import { unitPaise } from "./portalService";
import { scopedQuotationWhere } from "./queries";
import type { SessionUser } from "@/infrastructure/auth/session";

/**
 * A single invoice, for the internal workspace. Scoped the same way as every other
 * quotation-derived read, through `scopedQuotationWhere`: a rep who cannot see a
 * colleague's quotation must not be able to see that quotation's invoice by URL.
 *
 * Totals are computed from this invoice's own lines, in integer paise, the same way
 * `quotationService` computes them — not read off the quotation's totals, which would be
 * wrong for a recurring invoice that only bills a subset of the quotation's lines.
 */
export async function getInvoiceDetail(user: SessionUser, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, salesOrder: { quotation: scopedQuotationWhere(user) } },
    include: {
      payments: { orderBy: { paidAt: "asc" } },
      salesOrder: {
        include: {
          quotation: {
            include: {
              customer: true,
              owner: { select: { name: true, email: true } },
              lines: { include: { product: true, variant: true, plan: true }, orderBy: { sequence: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!invoice) return null;

  const quotation = invoice.salesOrder.quotation;
  const paid = paiseToDb(invoice.payments.reduce((s, p) => s + dbToPaise(p.amount), 0));

  const billedLines = quotation.lines.filter((l) =>
    invoice.type === "RECURRING" ? l.lineType === "RECURRING" : l.lineType !== "RECURRING",
  );

  const lines = billedLines.map((l) => {
    const unit = unitPaise(l);
    const discountPct = dbToPct(l.discountPct);
    const taxPct = dbToPct(l.taxPct);
    const taxableValuePaise = netLineTotal(unit, l.quantity, discountPct);
    const taxPaise = applyPct(taxableValuePaise, taxPct);
    return {
      id: l.id,
      productName: l.product.name,
      quantity: l.quantity,
      unitPrice: paiseToDb(unit),
      discountPct,
      taxPct,
      taxableValue: paiseToDb(taxableValuePaise),
      taxAmount: paiseToDb(taxPaise),
      lineTotal: paiseToDb(taxableValuePaise + taxPaise),
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const taxableValue = lines.reduce((s, l) => s + l.taxableValue, 0);
  const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
  const discountTotal = subtotal - taxableValue;

  return {
    id: invoice.id,
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    amount: Number(invoice.amount),
    paid,
    subtotal,
    discountTotal,
    taxableValue,
    taxTotal,
    invoiceDate: invoice.createdAt.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    periodStart: invoice.periodStart?.toISOString() ?? null,
    periodEnd: invoice.periodEnd?.toISOString() ?? null,
    isProrated: invoice.isProrated,
    orderNumber: invoice.salesOrder.number,
    quotationNumber: quotation.number,
    repName: quotation.owner.name,
    repEmail: quotation.owner.email,
    customer: {
      name: quotation.customer.name,
      email: quotation.customer.email,
      city: quotation.customer.city,
      country: quotation.customer.country,
    },
    lines,
    payments: invoice.payments.map((p) => ({
      amount: Number(p.amount),
      method: p.method,
      paidAt: p.paidAt.toISOString(),
    })),
  };
}
