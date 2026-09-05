"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sliders, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

export function SubscriptionActions({
  scheduleId,
  currentQuantity,
  productName,
}: {
  scheduleId: string;
  currentQuantity: number;
  productName: string;
}) {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<"CHANGE_QTY" | "CANCEL" | null>(null);
  const [qty, setQty] = useState(String(currentQuantity));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submitChangeQty(e: React.FormEvent) {
    e.preventDefault();
    const newQty = Number(qty);
    if (!newQty || newQty < 1) {
      setError("Quantity must be at least 1.");
      return;
    }
    if (newQty === currentQuantity) {
      setError("New quantity must be different from current quantity.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${scheduleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CHANGE_QUANTITY",
          newQuantity: newQty,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update subscription quantity.");
        return;
      }
      setModalMode(null);
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCancel(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError("A cancellation reason of at least 5 characters is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${scheduleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CANCEL",
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel subscription.");
        return;
      }
      setModalMode(null);
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setQty(String(currentQuantity));
          setReason("");
          setError(null);
          setModalMode("CHANGE_QTY");
        }}
      >
        <Sliders className="size-3.5" />
        Modify qty
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
        onClick={() => {
          setReason("");
          setError(null);
          setModalMode("CANCEL");
        }}
      >
        <Ban className="size-3.5" />
        Cancel
      </Button>

      {/* Change Quantity Modal */}
      <Modal
        open={modalMode === "CHANGE_QTY"}
        onClose={() => !submitting && setModalMode(null)}
        title={`Modify Quantity — ${productName}`}
        description={`Current quantity: ${currentQuantity}. Mid-cycle changes generate a prorated invoice or credit note automatically.`}
      >
        <form onSubmit={submitChangeQty} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <Input
            label="New quantity"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
            disabled={submitting || pending}
          />

          <Textarea
            label="Reason for adjustment (optional)"
            placeholder="e.g. Customer requested 2 additional seats mid-quarter"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting || pending}
            rows={2}
          />

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalMode(null)}
              disabled={submitting || pending}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Apply & Prorate
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cancel Subscription Modal */}
      <Modal
        open={modalMode === "CANCEL"}
        onClose={() => !submitting && setModalMode(null)}
        title={`Cancel Subscription — ${productName}`}
        description="Cancels forward billing. A prorated credit note will be issued for unused days if plan policy allows."
      >
        <form onSubmit={submitCancel} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <Textarea
            label="Cancellation reason"
            placeholder="Explain why the customer is cancelling (minimum 5 characters)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting || pending}
            required
            rows={3}
          />

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalMode(null)}
              disabled={submitting || pending}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={submitting || pending}
            >
              Confirm cancellation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
