"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles, ShieldCheck, Package, Receipt, Send, MessageSquare, Check, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { RiskPanel } from "./RiskPanel";
import type { RiskAssessment } from "@/domain/risk/types";
import type { MonthEndOffer } from "@/domain/promotion/monthEnd";

interface Line {
  id: string; productId: string; productName: string; variantLabel: string | null; categoryName: string;
  categoryCeilingPct: number; quantity: number; unitPrice: number; discountPct: number;
  lineType: string; planName: string | null; fromUpsell: boolean; netTotal: number;
}
interface Suggestion {
  ruleId: string; productId: string; productName: string; listPricePaise: number;
  productMarginPct: number; marginDeltaPct: number; isPromoted: boolean; reason: string;
}
interface VariantOption {
  id: string; attribute: string; value: string; extraPrice: number;
}

interface ProductOption {
  id: string; name: string; sku: string; categoryName: string;
  categoryCeilingPct: number; price: number; kind: string;
  variants: VariantOption[];
}
interface Negotiation {
  id: string; authorName: string; authorRole: string; body: string;
  lineId: string | null; lineProductName: string | null;
  requestedDiscountPct: number | null; status: string; createdAt: string;
}

export function QuotationBuilder({
  quotation, negotiations, assessment, initialSuggestions, monthEndOffer, products, audit, permissions,
}: {
  quotation: {
    id: string; number: string; status: string; customerName: string; customerTier: string;
    ownerName: string; riskScore: number; subtotal: number; discountTotal: number;
    taxTotal: number; total: number; marginPct: number; lines: Line[];
    approvalSteps: { id: string; level: string; status: string; sequence: number; approverName: string | null; reason: string | null; triggeredByScore: number }[];
    salesOrder: {
      number: string; status: string; shipmentCount: number;
      allocations: { id: string; productName: string; warehouseName: string | null; quantity: number; isBackorder: boolean }[];
      invoices: { id: string; number: string; type: string; status: string; amount: number; isProrated: boolean; periodStart: string | null; periodEnd: string | null; paidAmount: number }[];
      schedules: { id: string; productName: string; planName: string; interval: string; amountPerPeriod: number; nextBillingDate: string; status: string }[];
    } | null;
  };
  negotiations: Negotiation[];
  assessment: RiskAssessment | null;
  initialSuggestions: Suggestion[];
  monthEndOffer: MonthEndOffer | null;
  products: ProductOption[];
  audit: { id: string; action: string; reason: string | null; actorName: string; createdAt: string }[];
  permissions: { mayEdit: boolean; mayApproveManager: boolean; mayApproveFinance: boolean; mayConfirm: boolean; isOwner: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  // Dismissing an upsell suggestion is a per-session UI preference, not a business fact —
  // nothing downstream (pricing, approvals, audit) needs to know a rep hid a card, so it
  // lives only in client state rather than as a database column or an API call.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const categories = useMemo(() => {
    const names = Array.from(new Set(products.map((p) => p.categoryName)));
    return names;
  }, [products]);
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? "");
  const [newProductId, setNewProductId] = useState(products[0]?.id ?? "");
  const [newVariantId, setNewVariantId] = useState("");

  const selectedProduct = products.find((p) => p.id === newProductId);
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === newVariantId);
  // Shown before the line is added so the rep sees what the customer will pay, including
  // the variant's extra price. The server recomputes this on add from the tier price list;
  // this is a preview, not an input — a client-supplied price would make governance
  // advisory rather than enforced.
  const previewPrice = (selectedProduct?.price ?? 0) + (selectedVariant?.extraPrice ?? 0);
  const [newQty, setNewQty] = useState(1);
  const [newDiscount, setNewDiscount] = useState(0);

  const locked = quotation.salesOrder !== null;
  const editable = permissions.mayEdit && !locked && ["DRAFT", "APPROVED", "SENT", "UNDER_NEGOTIATION"].includes(quotation.status);
  // A rep can reply once the customer can actually see the thread — before the quotation
  // is sent, there is no portal audience for the message yet.
  const canReply = permissions.mayEdit && !locked && ["SENT", "UNDER_NEGOTIATION"].includes(quotation.status);
  const pendingStep = quotation.approvalSteps.find((s) => s.status === "PENDING");
  const mayActOnStep =
    pendingStep !== undefined &&
    !permissions.isOwner &&
    ((pendingStep.level === "SALES_MANAGER" && permissions.mayApproveManager) ||
      (pendingStep.level === "FINANCE" && permissions.mayApproveFinance));

  /** Every mutation refreshes from the server rather than patching local state — the
   *  score, totals and routing are all recomputed server-side, so trusting a local guess
   *  would let the screen disagree with the database. */
  async function call(url: string, init: RequestInit, successMessage?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return null; }
      if (data.suggestions) setSuggestions(data.suggestions);
      if (successMessage) setNotice(successMessage);
      if (data.reapprovalRequired) setNotice(data.reason);
      startTransition(() => router.refresh());
      return data;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally { setBusy(false); }
  }

  const working = busy || pending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={quotation.number}
        subtitle={`${quotation.customerName} · ${quotation.customerTier} · owned by ${quotation.ownerName}`}
        actions={<StatusBadge status={quotation.status} />}
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                      <th className="pb-2 pr-3 font-medium">Product</th>
                      <th className="pb-2 pr-3 text-right font-medium">Qty</th>
                      <th className="pb-2 pr-3 text-right font-medium">Unit</th>
                      <th className="pb-2 pr-3 text-right font-medium">Disc %</th>
                      <th className="pb-2 pr-3 text-right font-medium">Net</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {quotation.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-100">
                            {line.productName}
                            {line.fromUpsell ? <Badge tone="info">upsell</Badge> : null}
                            {line.lineType === "RECURRING" ? <Badge tone="neutral">{line.planName}</Badge> : null}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {line.variantLabel ? `${line.variantLabel} · ` : ""}
                            {line.categoryName} · ceiling {line.categoryCeilingPct}%
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {editable ? (
                            <input type="number" min={1} defaultValue={line.quantity} disabled={working}
                              onBlur={(e) => { const q = Number(e.target.value);
                                if (q !== line.quantity && q >= 1) void call(`/api/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ quantity: q }) }); }}
                              className="w-16 rounded border border-neutral-200 px-2 py-1 text-right tabular-nums dark:border-neutral-700 dark:bg-neutral-900" />
                          ) : <span className="tabular-nums">{line.quantity}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{money(line.unitPrice)}</td>
                        <td className="py-2 pr-3 text-right">
                          {editable ? (
                            <input type="number" min={0} max={100} step={0.5} defaultValue={line.discountPct} disabled={working}
                              onBlur={(e) => { const d = Number(e.target.value);
                                if (d !== line.discountPct && d >= 0) void call(`/api/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ discountPct: d }) }); }}
                              className={`w-20 rounded border px-2 py-1 text-right tabular-nums dark:bg-neutral-900 ${
                                line.discountPct > line.categoryCeilingPct
                                  ? "border-red-400 text-red-700 dark:border-red-600 dark:text-red-300"
                                  : "border-neutral-200 dark:border-neutral-700"}`} />
                          ) : <span className="tabular-nums">{line.discountPct}%</span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-medium tabular-nums">{money(line.netTotal)}</td>
                        <td className="py-2 text-right">
                          {editable ? (
                            <button type="button" aria-label={`Remove ${line.productName}`} disabled={working}
                              onClick={() => void call(`/api/lines/${line.id}`, { method: "DELETE" })}
                              className="rounded p-1 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {quotation.lines.length === 0 ? (
                      <tr><td colSpan={6} className="py-6 text-center text-sm text-neutral-500">No lines yet.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {editable ? (
                <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Product category">
                    {categories.map((c) => (
                      <button key={c} type="button" role="tab" aria-selected={activeCategory === c}
                        onClick={() => setActiveCategory(c)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          activeCategory === c
                            ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                            : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {products.filter((p) => p.categoryName === activeCategory).map((p) => (
                      <button key={p.id} type="button" disabled={working}
                        onClick={() => { setNewProductId(p.id); setNewVariantId(""); }}
                        className={`rounded-lg border p-3 text-left transition ${
                          newProductId === p.id
                            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40"
                            : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                        }`}>
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">{p.name}</div>
                        <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                          <span className="tabular-nums">{money(p.price)}</span>
                          <span>max {p.categoryCeilingPct}%</span>
                        </div>
                      </button>
                    ))}
                    {products.filter((p) => p.categoryName === activeCategory).length === 0 ? (
                      <p className="col-span-full py-4 text-center text-sm text-neutral-500">No products in this category.</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    {/* Only rendered for products that actually have variants, so the common
                        case stays a two-field form rather than carrying an empty control. */}
                    {selectedProduct && selectedProduct.variants.length > 0 ? (
                      <Select label={selectedProduct.variants[0].attribute} value={newVariantId} disabled={working}
                        onChange={(e) => setNewVariantId(e.target.value)} containerClassName="min-w-[160px]">
                        <option value="">Standard</option>
                        {selectedProduct.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.value}{v.extraPrice ? ` (+${money(v.extraPrice)})` : ""}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <Input label="Qty" type="number" min={1} value={newQty} disabled={working}
                      onChange={(e) => setNewQty(Number(e.target.value))} containerClassName="w-20" />
                    <Input label="Discount %" type="number" min={0} max={100} step={0.5} value={newDiscount} disabled={working}
                      onChange={(e) => setNewDiscount(Number(e.target.value))} containerClassName="w-28" />
                    <Button loading={working} disabled={!selectedProduct} onClick={() => void call(`/api/quotations/${quotation.id}/lines`, {
                      method: "POST",
                      body: JSON.stringify({
                        productId: newProductId,
                        variantId: newVariantId || null,
                        quantity: newQty,
                        discountPct: newDiscount,
                      }),
                    })}><Plus className="size-4" />Add</Button>
                    <span className="pb-2 text-xs text-neutral-500">
                      {selectedProduct ? `Unit ${money(previewPrice)}` : "Pick a product"}
                    </span>
                  </div>
                </div>
              ) : null}

              <dl className="ml-auto max-w-xs space-y-1.5 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
                <Row label="Subtotal" value={money(quotation.subtotal)} />
                <Row label="Discount" value={`− ${money(quotation.discountTotal)}`} />
                <Row label="Tax" value={money(quotation.taxTotal)} />
                <Row label="Total" value={money(quotation.total)} strong />
              </dl>
              {/* The live margin is one of the two numbers this demo turns on — it earns its
                  own callout rather than blending into the totals list above. */}
              <div className="ml-auto flex max-w-xs items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950/30">
                <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Margin</span>
                <span className="text-2xl font-bold tabular-nums leading-none text-indigo-700 dark:text-indigo-300">
                  {quotation.marginPct}%
                </span>
              </div>
            </CardContent>
          </Card>

          {quotation.salesOrder ? <OrderPanel order={quotation.salesOrder} /> : null}
          <AuditPanel audit={audit} />
        </div>

        <div className="space-y-6">
          {assessment ? <RiskPanel assessment={assessment} explanation={explain(assessment)} /> : null}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" />Approvals</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {quotation.approvalSteps.length === 0 ? (
                <p className="text-sm text-neutral-500">No approval required at the current score.</p>
              ) : quotation.approvalSteps.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {s.level === "SALES_MANAGER" ? "Sales Manager" : "Finance"}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {s.approverName ? `${s.approverName} · ` : ""}triggered at score {s.triggeredByScore}
                    </div>
                    {s.reason ? <div className="mt-0.5 text-xs italic text-neutral-500">“{s.reason}”</div> : null}
                  </div>
                  <Badge tone={stepTone(s.status)}>{s.status.toLowerCase()}</Badge>
                </div>
              ))}

              <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                {editable && quotation.status === "DRAFT" ? (
                  <Button loading={working} onClick={() => void call(`/api/quotations/${quotation.id}/submit`, { method: "POST" })}>
                    Submit
                  </Button>
                ) : null}
                {mayActOnStep ? (
                  <>
                    <Button loading={working} onClick={() => void call(`/api/quotations/${quotation.id}/decision`, {
                      method: "POST", body: JSON.stringify({ action: "APPROVE", reason: "Approved" }) }, "Approved.")}>
                      Approve
                    </Button>
                    <Button variant="danger" loading={working} onClick={() => {
                      const reason = window.prompt("Reason for rejection?");
                      if (!reason) return;
                      void call(`/api/quotations/${quotation.id}/decision`, { method: "POST", body: JSON.stringify({ action: "REJECT", reason }) });
                    }}>Reject</Button>
                    <Button variant="secondary" loading={working} onClick={() => {
                      const reason = window.prompt("What needs changing?");
                      if (!reason) return;
                      void call(`/api/quotations/${quotation.id}/decision`, { method: "POST", body: JSON.stringify({ action: "RETURN", reason }) });
                    }}>Return</Button>
                  </>
                ) : null}
                {editable && quotation.status === "APPROVED" && !locked ? (
                  <Button
                    variant="secondary"
                    loading={working}
                    onClick={() =>
                      void call(
                        `/api/quotations/${quotation.id}/send`,
                        { method: "POST" },
                        "Quotation published to the customer portal.",
                      )
                    }
                  >
                    <Send className="size-4" />
                    Send to customer
                  </Button>
                ) : null}
                {permissions.mayConfirm && quotation.status === "APPROVED" && !locked ? (
                  <Button loading={working} onClick={() => void call(`/api/quotations/${quotation.id}/confirm`, { method: "POST" }, "Order confirmed.")}>
                    Confirm order
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {negotiations.length > 0 || canReply ? (
            <NegotiationPanel
              negotiations={negotiations}
              canRespond={permissions.mayEdit}
              canReply={canReply}
              working={working}
              onRespond={(id, action, reason) =>
                void call(
                  `/api/negotiations/${id}`,
                  { method: "POST", body: JSON.stringify(action === "ACCEPT" ? { action } : { action, reason }) },
                  action === "ACCEPT" ? "Counter-offer accepted." : "Counter-offer declined.",
                )
              }
              onReply={(body) =>
                void call(
                  `/api/quotations/${quotation.id}/messages`,
                  { method: "POST", body: JSON.stringify({ body }) },
                  "Message sent to customer.",
                )
              }
            />
          ) : null}

          {/* Gated the same way the upsell panel is: a confirmed, invoiced deal cannot
              take a discount, so offering one there is noise on a screen that is now a
              record rather than a workspace. */}
          {editable ? <MonthEndOfferPanel offer={monthEndOffer} /> : null}

          {editable && suggestions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="size-4" />Suggested add-ons</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {suggestions.filter((s) => !dismissed.has(s.productId)).map((s) => (
                  <div key={s.ruleId} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {s.productName}
                          {s.isPromoted ? <Badge tone="warning">promoted</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">{s.reason}</p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">{money(s.listPricePaise / 100)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`text-xs tabular-nums ${s.marginDeltaPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        margin {s.marginDeltaPct >= 0 ? "+" : ""}{s.marginDeltaPct}pp
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="ghost"
                          onClick={() => setDismissed((prev) => new Set(prev).add(s.productId))}>Dismiss</Button>
                        <Button size="sm" variant="secondary" loading={working}
                          onClick={() => void call(`/api/quotations/${quotation.id}/lines`, {
                            method: "POST",
                            body: JSON.stringify({ productId: s.productId, quantity: 1, discountPct: 0, fromUpsell: true }),
                          })}>Add to quote</Button>
                      </div>
                    </div>
                  </div>
                ))}
                {dismissed.size > 0 ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    onClick={() => setDismissed(new Set())}
                  >
                    Show {dismissed.size} dismissed
                  </button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MonthEndOfferPanel({ offer }: { offer: MonthEndOffer | null }) {
  // Outside the window the server sends null, so there is nothing here to render and
  // nothing in the page source either. A rep who could see "you'll be able to give 3% in
  // 25 days" would tell the customer, turning a month-end incentive into a reason to
  // wait — the exact opposite of what the promotion is for.
  if (!offer || !offer.eligible) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="size-4" />Month-end offer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{offer.reason}</p>

        {offer.lineBonuses.map((b) => (
          <div key={b.lineId} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  <span>{b.productName}</span>
                  <span className="text-xs font-normal tabular-nums text-neutral-500">
                    {b.currentDiscountPct}% → {b.resultingDiscountPct}%
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">{b.reason}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums font-medium text-neutral-900 dark:text-neutral-100">
                {money(b.savingPaise / 100)}
              </span>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">Total saving</span>
          <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            {money(offer.totalSavingPaise / 100)}
          </span>
        </div>

        {offer.gift ? (
          <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  <span>{offer.gift.productName}</span>
                  <Badge tone="success">free</Badge>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">{offer.gift.reason}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-neutral-500">
                {money(offer.gift.listPricePaise / 100)}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OrderPanel({ order }: { order: NonNullable<Parameters<typeof QuotationBuilder>[0]["quotation"]["salesOrder"]> }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="size-4" />Fulfilment — {order.number}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {order.shipmentCount} shipment{order.shipmentCount === 1 ? "" : "s"}
            {order.shipmentCount === 1 ? " — the whole order ships from one warehouse." : " — no single warehouse could cover the order."}
          </p>
          {order.allocations.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-neutral-800 dark:text-neutral-200">{a.productName}</span>
              <span className="flex items-center gap-2 text-neutral-500">
                <span className="tabular-nums">{a.quantity}</span>
                {a.isBackorder ? <Badge tone="warning">backorder</Badge> : <Badge tone="neutral">{a.warehouseName}</Badge>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="size-4" />Billing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {order.invoices.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="font-mono text-xs text-neutral-500">{i.number}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={i.type === "RECURRING" ? "info" : "neutral"}>{i.type === "RECURRING" ? "recurring" : "one-time"}</Badge>
                  {i.isProrated ? <Badge tone="warning">prorated</Badge> : null}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular-nums">{money(i.amount)}</div>
                <Badge tone={i.status === "PAID" ? "success" : "warning"}>{i.status.toLowerCase()}</Badge>
              </div>
            </div>
          ))}
          {order.schedules.map((s) => (
            <div key={s.id} className="rounded-md bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-900">
              <div className="font-medium text-neutral-900 dark:text-neutral-100">{s.productName}</div>
              <div className="text-xs text-neutral-500">
                {s.planName} · {money(s.amountPerPeriod)} per period · next {new Date(s.nextBillingDate).toLocaleDateString("en-IN")}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function NegotiationPanel({
  negotiations, canRespond, canReply, working, onRespond, onReply,
}: {
  negotiations: Negotiation[];
  canRespond: boolean;
  canReply: boolean;
  working: boolean;
  onRespond: (id: string, action: "ACCEPT" | "DECLINE", reason?: string) => void;
  onReply: (body: string) => void;
}) {
  // Newest first, so the counter-offer the rep actually has to act on is the first
  // thing they see rather than buried under the history of the conversation.
  const ordered = [...negotiations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [draft, setDraft] = useState("");

  function submitReply() {
    const body = draft.trim();
    if (!body) return;
    onReply(body);
    setDraft("");
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-4" />Negotiation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {canReply ? (
          <div className="flex items-start gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply to the customer…"
              rows={2}
              disabled={working}
              className="flex-1"
            />
            <Button size="sm" loading={working} disabled={!draft.trim()} onClick={submitReply}>
              <Send className="size-4" />Send
            </Button>
          </div>
        ) : null}
        {ordered.map((n) => {
          const isCustomer = n.authorRole === "PORTAL";
          const open = n.status === "OPEN";
          return (
            <div key={n.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {n.authorName} <span className="font-normal text-neutral-500">· {isCustomer ? "customer" : n.authorRole.replace("_", " ").toLowerCase()}</span>
                  </div>
                  {n.lineProductName ? (
                    <div className="text-xs text-neutral-500">re: {n.lineProductName}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={open ? "warning" : n.status === "ACCEPTED" ? "success" : "neutral"}>{n.status.toLowerCase()}</Badge>
                  <span className="text-xs text-neutral-400">{new Date(n.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
              <p className="mt-1.5 break-words text-sm text-neutral-700 dark:text-neutral-300">{n.body}</p>
              {n.requestedDiscountPct !== null ? (
                <div className="mt-2 inline-flex items-baseline gap-1 rounded-md bg-amber-50 px-2 py-1 dark:bg-amber-950/40">
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Requested discount</span>
                  <span className="text-lg font-bold tabular-nums text-amber-900 dark:text-amber-200">{n.requestedDiscountPct}%</span>
                </div>
              ) : null}
              {open && isCustomer && canRespond ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" loading={working} onClick={() => onRespond(n.id, "ACCEPT")}>
                    <Check className="size-4" />Accept
                  </Button>
                  <Button size="sm" variant="danger" loading={working} onClick={() => {
                    const reason = window.prompt("Reason for declining this counter-offer?");
                    if (reason === null) return;
                    onRespond(n.id, "DECLINE", reason || undefined);
                  }}>
                    <X className="size-4" />Decline
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AuditPanel({ audit }: { audit: { id: string; action: string; reason: string | null; actorName: string; createdAt: string }[] }) {
  if (audit.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {audit.slice(0, 12).map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{a.action.replaceAll("_", " ").toLowerCase()}</span>
                {a.reason ? <span className="text-neutral-500"> — {a.reason}</span> : null}
              </div>
              <span className="shrink-0 text-xs text-neutral-400">
                {a.actorName} · {new Date(a.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
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

function Alert({ tone, children }: { tone: "danger" | "info"; children: React.ReactNode }) {
  return (
    <p role="alert" className={`rounded-md px-3 py-2 text-sm ${
      tone === "danger"
        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        : "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"}`}>{children}</p>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === "CONFIRMED" ? "success"
    : status === "REJECTED" || status === "CANCELLED" ? "danger"
    : status.startsWith("PENDING") ? "warning"
    : status === "APPROVED" ? "info" : "neutral";
  return <Badge tone={tone}>{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}

function stepTone(status: string): BadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "RETURNED") return "warning";
  if (status === "PENDING") return "info";
  return "neutral";
}

/** Mirrors the server's wording so the panel reads the same before and after a refresh. */
function explain(a: RiskAssessment): string {
  if (a.drivingSignal === "NONE") return "Every line is within its discount ceiling. No approval required.";
  if (a.drivingSignal === "SEVERITY") {
    const worst = a.lines.reduce((w, l) => (l.breachPts > w.breachPts ? l : w), a.lines[0]);
    return `Driven by a single line: "${worst.productName}" is ${worst.breachPts} points over its ${worst.effectiveCeilingPct}% ceiling.`;
  }
  return `Driven by spread: ${a.breachingLineCount} lines are individually over their ceilings.`;
}

function money(rupees: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(rupees);
}
