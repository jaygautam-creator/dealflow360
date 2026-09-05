"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";

interface PortalLine {
  id: string; productName: string; description: string | null; quantity: number;
  unitPrice: number; discountPct: number; lineType: string; planName: string | null; lineTotal: number;
}
interface PortalMessage {
  id: string; body: string; lineId: string | null; requestedDiscountPct: number | null;
  status: string; fromCustomer: boolean; authorName: string; createdAt: string;
}

export function PortalQuotation({
  quotation,
}: {
  quotation: {
    id: string; number: string; status: string; subtotal: number; discountTotal: number;
    taxTotal: number; total: number; repName: string; repEmail: string;
    lines: PortalLine[]; messages: PortalMessage[];
    order: { number: string; invoices: { number: string; type: string; status: string; amount: number; paid: number }[] } | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [counter, setCounter] = useState("");
  const [lineId, setLineId] = useState<string | null>(null);

  const confirmed = quotation.status === "CONFIRMED";
  const working = busy || pending;

  async function send() {
    if (!body.trim()) { setError("Write a message first."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/portal/quotations/${quotation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          lineId,
          requestedDiscountPct: counter.trim() === "" ? null : Number(counter),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not send your message."); return; }
      setBody(""); setCounter(""); setLineId(null);
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server.");
    } finally { setBusy(false); }
  }

  async function confirmTerms() {
    if (!window.confirm("Do you accept these quotation terms and wish to confirm the order?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/quotations/${quotation.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not confirm quotation.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold text-neutral-900 dark:text-neutral-50">
            {quotation.number}
          </h1>
          <p className="mt-1 break-words text-sm text-neutral-500">
            Your contact: {quotation.repName} · {quotation.repEmail}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={confirmed ? "success" : quotation.status === "UNDER_NEGOTIATION" ? "warning" : "info"}>
            {confirmed ? "Confirmed" : quotation.status === "UNDER_NEGOTIATION" ? "In discussion" : "Awaiting your review"}
          </Badge>
          {!confirmed && (quotation.status === "SENT" || quotation.status === "UNDER_NEGOTIATION") ? (
            <Button
              loading={working}
              onClick={() => void confirmTerms()}
              className="bg-emerald-600 hover:bg-emerald-500 focus-visible:outline-emerald-600 text-white"
            >
              <CheckCircle className="size-4" />
              Confirm quotation
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>What you are quoted for</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                  <th className="pb-2 pr-3 font-medium">Item</th>
                  <th className="pb-2 pr-3 text-right font-medium">Qty</th>
                  <th className="pb-2 pr-3 text-right font-medium">Unit price</th>
                  <th className="pb-2 pr-3 text-right font-medium">Discount</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {quotation.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-100">
                        {l.productName}
                        {l.lineType === "RECURRING" ? <Badge tone="info">{l.planName}</Badge> : null}
                      </div>
                      {l.description ? <p className="text-xs text-neutral-500">{l.description}</p> : null}
                      {!confirmed ? (
                        <button
                          type="button"
                          onClick={() => setLineId(lineId === l.id ? null : l.id)}
                          className={`mt-1 text-xs underline-offset-2 hover:underline ${
                            lineId === l.id ? "font-medium text-teal-700 dark:text-teal-400" : "text-neutral-400"}`}
                        >
                          {lineId === l.id ? "asking about this item" : "ask about this item"}
                        </button>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.quantity}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(l.unitPrice)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {l.discountPct > 0 ? `${l.discountPct}%` : "—"}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto mt-4 max-w-xs space-y-1 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
            <Row label="Subtotal" value={money(quotation.subtotal)} />
            {quotation.discountTotal > 0 ? <Row label="Discount" value={`− ${money(quotation.discountTotal)}`} /> : null}
            <Row label="Tax" value={money(quotation.taxTotal)} />
            <Row label="Total" value={money(quotation.total)} strong />
          </dl>
        </CardContent>
      </Card>

      {quotation.order ? (
        <Card>
          <CardHeader><CardTitle>Order {quotation.order.number}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {quotation.order.invoices.map((i) => (
              <div key={i.number} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-all font-mono text-xs text-neutral-500">{i.number}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={i.type === "RECURRING" ? "info" : "neutral"}>
                    {i.type === "RECURRING" ? "subscription" : "one-time"}
                  </Badge>
                  <span className="tabular-nums">{money(i.amount)}</span>
                  <Badge tone={i.status === "PAID" ? "success" : "warning"}>{i.status.toLowerCase()}</Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="size-4" />Discussion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {quotation.messages.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No messages yet. Ask a question or propose a different price below.
            </p>
          ) : (
            <ol className="space-y-3">
              {quotation.messages.map((m) => (
                <li key={m.id} className={`flex ${m.fromCustomer ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.fromCustomer
                      ? "bg-teal-600 text-white"
                      : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.requestedDiscountPct !== null ? (
                      <p className={`mt-1 text-xs ${m.fromCustomer ? "text-teal-100" : "text-neutral-500"}`}>
                        Requested {m.requestedDiscountPct}% ·{" "}
                        {m.status === "ACCEPTED" ? "accepted" : m.status === "DECLINED" ? "declined" : "awaiting a response"}
                      </p>
                    ) : null}
                    <p className={`mt-1 text-xs ${m.fromCustomer ? "text-teal-200" : "text-neutral-400"}`}>
                      {m.authorName} · {new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {!confirmed ? (
            <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              {error ? (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              {lineId ? (
                <p className="text-xs text-teal-700 dark:text-teal-400">
                  Your message is attached to a specific item.{" "}
                  <button type="button" onClick={() => setLineId(null)} className="underline">
                    ask about the whole quotation instead
                  </button>
                </p>
              ) : null}
              <Textarea
                label="Message"
                rows={3}
                placeholder="Ask a question, or explain what you need changed…"
                value={body}
                disabled={working}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  label="Propose a discount % (optional)"
                  type="number" min={0} max={100} step={0.5}
                  placeholder="e.g. 20"
                  value={counter}
                  disabled={working}
                  onChange={(e) => setCounter(e.target.value)}
                  containerClassName="w-56"
                  hint="Your sales contact reviews this before anything changes."
                />
                <Button
                  loading={working}
                  onClick={() => void send()}
                  className="bg-teal-600 hover:bg-teal-500 focus-visible:outline-teal-600 disabled:bg-teal-300"
                >
                  <Send className="size-4" />
                  Send
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-neutral-900 dark:text-neutral-100" : "text-neutral-700 dark:text-neutral-300"}`}>{value}</dd>
    </div>
  );
}

function money(rupees: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(rupees);
}
