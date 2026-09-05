import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPaise, paiseToDb } from "@/infrastructure/money";
import { writeAudit } from "./quotationService";
import { DomainError } from "@/app/api/_lib/respond";

/**
 * Payment recording.
 *
 * An invoice is settled by comparing what has been paid against what is owed, rather than
 * by trusting the caller to say "this one is paid now". That distinction matters: partial
 * payments are normal in B2B, and a status derived from the payment rows can never
 * disagree with them.
 */
export async function recordPayment(
  invoiceId: string,
  input: { amount: number; method?: string },
  actorId: string,
) {
  if (input.amount <= 0) throw new DomainError("A payment must be greater than zero.");

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { payments: true, creditNotes: true },
    });

    if (invoice.status === "PAID") throw new DomainError("This invoice is already settled.");
    if (invoice.status === "CREDITED") throw new DomainError("This invoice has been credited and cannot take a payment.");

    const owedPaise = dbToPaise(invoice.amount) - sum(invoice.creditNotes.map((c) => dbToPaise(c.amount)));
    const paidPaise = sum(invoice.payments.map((p) => dbToPaise(p.amount)));
    const incomingPaise = Math.round(input.amount * 100);

    if (paidPaise + incomingPaise > owedPaise) {
      throw new DomainError(
        `That would overpay the invoice. ${((owedPaise - paidPaise) / 100).toFixed(2)} is outstanding.`,
      );
    }

    await tx.payment.create({
      data: { invoiceId, amount: paiseToDb(incomingPaise), method: input.method ?? "BANK" },
    });

    // Status is derived, never asserted.
    const nowPaid = paidPaise + incomingPaise >= owedPaise;
    if (nowPaid) {
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
    }

    await writeAudit(tx, {
      entityType: "Invoice",
      entityId: invoiceId,
      action: nowPaid ? "INVOICE_SETTLED" : "PAYMENT_RECORDED",
      actorId,
      reason: `${(incomingPaise / 100).toFixed(2)} received by ${input.method ?? "BANK"}`,
      payload: { incoming: incomingPaise / 100, totalPaid: (paidPaise + incomingPaise) / 100, owed: owedPaise / 100 },
    });

    return {
      invoiceNumber: invoice.number,
      status: nowPaid ? "PAID" : "OPEN",
      paidAmount: (paidPaise + incomingPaise) / 100,
      outstandingAmount: (owedPaise - paidPaise - incomingPaise) / 100,
    };
  });
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
