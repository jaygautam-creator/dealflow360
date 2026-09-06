import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, paiseToDb, dbToPct } from "@/infrastructure/money";
import { netLineTotal } from "@/domain/upsell/recommend";
import { unitPaise } from "./portalService";
import { scopedQuotationWhere } from "./queries";
import type { SessionUser } from "@/infrastructure/auth/session";

/**
 * A single invoice, for the internal workspace. Scoped the same way as every other
 * quotation-derived read, through `scopedQuotationWhere`: a rep who cannot see a
 * colleague's quotation must not be able to see that quotation's invoice by URL.
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

  return {
    id: invoice.id,
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    amount: Number(invoice.amount),
    paid,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    periodStart: invoice.periodStart?.toISOString() ?? null,
    periodEnd: invoice.periodEnd?.toISOString() ?? null,
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
    lines: quotation.lines
      .filter((l) => (invoice.type === "RECURRING" ? l.lineType === "RECURRING" : l.lineType !== "RECURRING"))
      .map((l) => ({
        id: l.id,
        productName: l.product.name,
        quantity: l.quantity,
        unitPrice: paiseToDb(unitPaise(l)),
        discountPct: dbToPct(l.discountPct),
        lineTotal: paiseToDb(netLineTotal(unitPaise(l), l.quantity, dbToPct(l.discountPct))),
      })),
    payments: invoice.payments.map((p) => ({
      amount: Number(p.amount),
      method: p.method,
      paidAt: p.paidAt.toISOString(),
    })),
  };
}
