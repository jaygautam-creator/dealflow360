import Link from "next/link";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { listPortalQuotations } from "@/application/portalService";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileText } from "lucide-react";

export const metadata = { title: "Your quotations — DealFlow360" };
export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const user = await requireUserPage("/portal");
  const quotations = await listPortalQuotations(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Your quotations
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Review, ask questions and confirm — no email required.
        </p>
      </div>

      {quotations.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="Nothing to review yet"
          description="When your sales contact sends a quotation, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {quotations.map((q) => (
            <Link key={q.id} href={`/portal/quotations/${q.id}`} className="block">
              <Card className="transition hover:border-teal-300 hover:shadow-sm dark:hover:border-teal-700">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-neutral-900 dark:text-neutral-100">
                        {q.number}
                      </span>
                      <Badge tone={statusTone(q.status)}>{statusLabel(q.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {q.lineCount} item{q.lineCount === 1 ? "" : "s"}
                      {q.messageCount > 0 ? ` · ${q.messageCount} message${q.messageCount === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                    {money(q.total)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Customer-facing wording. Internal state names are not the customer's vocabulary. */
function statusLabel(status: string): string {
  switch (status) {
    case "SENT": return "Awaiting your review";
    case "UNDER_NEGOTIATION": return "In discussion";
    case "CONFIRMED": return "Confirmed";
    default: return status.toLowerCase();
  }
}

function statusTone(status: string): BadgeTone {
  if (status === "CONFIRMED") return "success";
  if (status === "UNDER_NEGOTIATION") return "warning";
  return "info";
}

function money(rupees: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(rupees);
}
