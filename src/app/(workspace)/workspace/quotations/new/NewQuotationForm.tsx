"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface CustomerOption {
  id: string; name: string; tier: string; city: string | null; ceilingPct: number;
}

export function NewQuotationForm({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(customers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create the quotation."); return; }
      router.push(`/workspace/quotations/${data.id}`);
    } catch {
      setError("Could not reach the server.");
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-700">Customer</legend>
          {customers.map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition ${
                selected === c.id
                  ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200"
                  : "border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio" name="customer" value={c.id}
                  checked={selected === c.id}
                  onChange={() => setSelected(c.id)}
                  className="size-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900">{c.name}</span>
                  {c.city ? <span className="block text-xs text-neutral-500">{c.city}</span> : null}
                </span>
              </span>
              {/* Showing the ceiling at selection time makes the governance visible before
                  the rep starts discounting, rather than as a surprise at submission. */}
              <span className="flex items-center gap-2">
                <Badge tone={c.tier === "GOLD" ? "warning" : "neutral"}>{c.tier}</Badge>
                <span className="text-xs tabular-nums text-neutral-500">max {c.ceilingPct}%</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Button className="w-full" loading={busy} onClick={() => void create()}>
          Create quotation
        </Button>
      </CardContent>
    </Card>
  );
}
