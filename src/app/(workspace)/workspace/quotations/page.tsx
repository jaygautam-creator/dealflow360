import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { listQuotations } from "@/application/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Quotations" };
export const dynamic = "force-dynamic";

/**
 * The table counterpart to the pipeline board. The board answers "where is everything
 * stuck"; this answers "find me that one deal" — sorted, dense and scannable.
 */
export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUserPage("/workspace/quotations");
  const q = ((await searchParams).q ?? "").trim();
  const all = await listQuotations(user);

  // Filtered after the scoped query rather than inside it: listQuotations already applies
  // the caller's tenancy filter, so search can only ever narrow what they were entitled to
  // see. A search that widened the result set would be a much worse bug than a slow one,
  // and at demo scale this list is small enough that the round trip is not the cost.
  const needle = q.toLowerCase();
  const quotations = needle
    ? all.filter(
        (item) =>
          item.number.toLowerCase().includes(needle) ||
          item.customer.name.toLowerCase().includes(needle),
      )
    : all;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        subtitle={q ? `${quotations.length} matching “${q}”` : `${quotations.length} in view`}
        actions={
          <Link href="/workspace/quotations/new">
            <Button><Plus className="size-4" />New quotation</Button>
          </Link>
        }
      />

      {quotations.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : "No quotations"}
          description={q ? "Try a customer name or a quotation number." : "Create one to get started."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3 font-medium">Number</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 text-right font-medium">Risk</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-right font-medium">Last touched</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {quotations.map((q) => (
                    <tr key={q.id} className="transition hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <Link href={`/workspace/quotations/${q.id}`} className="font-mono text-xs font-medium text-indigo-600 hover:underline">
                          {q.number}
                        </Link>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-neutral-900" title={q.customer.name}>{q.customer.name}</span>
                          <span className="shrink-0 text-xs text-neutral-400">{q.customer.tier}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{q.owner.name}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(q.status)}>{label(q.status)}</Badge></td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(q.riskScore) > 0 ? (
                          <span className={Number(q.riskScore) >= 5 ? "font-medium text-red-600" : "font-medium text-amber-600"}>
                            {Number(q.riskScore)}
                          </span>
                        ) : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-900">{money(Number(q.total))}</td>
                      <td className="px-4 py-3 text-right text-xs text-neutral-400">
                        {new Date(q.lastActivityAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function label(s: string) { return s.replaceAll("_", " ").toLowerCase(); }
function statusTone(s: string): BadgeTone {
  if (s === "CONFIRMED") return "success";
  if (s === "REJECTED" || s === "CANCELLED") return "danger";
  if (s.startsWith("PENDING")) return "warning";
  if (s === "APPROVED") return "info";
  return "neutral";
}
function money(r: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(r);
}
