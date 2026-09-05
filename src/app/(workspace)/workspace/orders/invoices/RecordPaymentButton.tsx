"use client";

import { useState, useTransition } from "react";

/** The four options rendered below. Named so the cast on change asserts something real
    rather than going through `any`, which would accept any string at all. */
type PaymentMethod = "BANK" | "CASH" | "CARD" | "UPI";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function RecordPaymentButton({
  invoiceId,
  invoiceNumber,
  outstandingRupees,
}: {
  invoiceId: string;
  invoiceNumber: string;
  outstandingRupees: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(outstandingRupees));
  const [method, setMethod] = useState<PaymentMethod>("BANK");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid amount greater than zero.");
      return;
    }
    if (numAmount > outstandingRupees) {
      setError(`Amount cannot exceed outstanding balance of ₹${outstandingRupees.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: numAmount, method }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to record payment.");
        return;
      }
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setAmount(String(outstandingRupees));
          setError(null);
          setOpen(true);
        }}
      >
        <CreditCard className="size-3.5" />
        Record payment
      </Button>

      <Modal
        open={open}
        onClose={() => !submitting && setOpen(false)}
        title={`Record Payment — ${invoiceNumber}`}
        description={`Outstanding balance: ₹${outstandingRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
      >
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <Input
            label="Payment amount (INR)"
            type="number"
            step="0.01"
            min="0.01"
            max={outstandingRupees}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            disabled={submitting || pending}
          />

          <Select
            label="Payment method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            disabled={submitting || pending}
          >
            <option value="BANK">Bank transfer</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Credit / Debit card</option>
            <option value="CASH">Cash</option>
          </Select>

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting || pending}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Confirm payment
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
