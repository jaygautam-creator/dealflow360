"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface ConsolidateBackorderButtonProps {
  orderId: string;
  warehouseId: string;
  warehouseName: string;
}

export function ConsolidateBackorderButton({
  orderId,
  warehouseId,
  warehouseName,
}: ConsolidateBackorderButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConsolidate() {
    if (!confirm(`Consolidate remaining backordered items into ${warehouseName}?`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/consolidate-backorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to consolidate backorder.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consolidation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={loading}
        onClick={handleConsolidate}
        className="h-auto p-0 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-transparent text-left"
        title={`${warehouseName} can now cover every backordered line on this order.`}
      >
        {loading ? "Consolidating…" : `Consolidate Remaining Backorder — ${warehouseName}`}
      </Button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
