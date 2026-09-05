"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

interface Line {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
}

interface AllocationRow {
  key: string;
  lineId: string;
  warehouseId: string | null;
  quantity: number;
}

interface Warehouse {
  id: string;
  name: string;
  stockByProduct: Record<string, number>;
}

export function OverrideForm({
  orderId,
  lines,
  allocations,
  warehouses,
}: {
  orderId: string;
  lines: Line[];
  allocations: { lineId: string; productId: string; warehouseId: string | null; quantity: number }[];
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AllocationRow[]>(
    allocations.map((a, i) => ({ key: `existing-${i}`, lineId: a.lineId, warehouseId: a.warehouseId, quantity: a.quantity })),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function updateRow(key: string, patch: Partial<AllocationRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow(lineId: string) {
    setRows((rs) => [...rs, { key: `new-${Date.now()}-${Math.random()}`, lineId, warehouseId: null, quantity: 1 }]);
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  async function submit() {
    setError(null);
    if (reason.trim().length < 5) {
      setError("Reason must be at least 5 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/fulfillment-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          allocations: rows.map((r) => ({ lineId: r.lineId, warehouseId: r.warehouseId, quantity: r.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The override was refused.");
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual override</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {lines.map((line) => {
          const lineRows = rows.filter((r) => r.lineId === line.id);
          const assigned = lineRows.reduce((s, r) => s + (Number.isFinite(r.quantity) ? r.quantity : 0), 0);
          const balanced = assigned === line.quantity;
          return (
            <div key={line.id} className="space-y-2 rounded-md border border-neutral-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-900">
                  {line.productName} <span className="text-neutral-400">· needs {line.quantity}</span>
                </p>
                <span className={`text-xs font-medium ${balanced ? "text-emerald-600" : "text-red-600"}`}>
                  {assigned} / {line.quantity} assigned
                </span>
              </div>

              {lineRows.map((row) => {
                const stock = row.warehouseId
                  ? (warehouses.find((w) => w.id === row.warehouseId)?.stockByProduct[line.productId] ?? 0)
                  : null;
                return (
                  <div key={row.key} className="flex items-center gap-2">
                    <Select
                      containerClassName="flex-1"
                      value={row.warehouseId ?? ""}
                      onChange={(e) => updateRow(row.key, { warehouseId: e.target.value || null })}
                    >
                      <option value="">Backorder (no warehouse)</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} — {w.stockByProduct[line.productId] ?? 0} in stock
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
                    />
                    {row.warehouseId && stock !== null && row.quantity > stock && (
                      <span className="text-xs text-red-600">exceeds stock</span>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
                      Remove
                    </Button>
                  </div>
                );
              })}

              <Button type="button" variant="secondary" size="sm" onClick={() => addRow(line.id)}>
                Split another warehouse
              </Button>
            </div>
          );
        })}

        <Textarea
          label="Reason for override"
          placeholder="Explain why this reassignment is needed"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Override applied.</p>}

        <Button type="button" onClick={submit} loading={submitting}>
          Apply override
        </Button>
      </CardContent>
    </Card>
  );
}
