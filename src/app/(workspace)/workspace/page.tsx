import Link from "next/link";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { listQuotations } from "@/application/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FileText, Plus } from "lucide-react";
import type { QuotationStatus } from "@/generated/prisma";

export const metadata = { title: "Pipeline — DealFlow360" };
// Every read is scoped to the signed-in principal, so nothing here may be cached
// across requests.
export const dynamic = "force-dynamic";

/** Pipeline stages, in the order a deal actually moves through them. */
const STAGES: { key: QuotationStatus[]; label: string; tone: BadgeTone }[] = [
  { key: ["DRAFT"], label: "Draft", tone: "neutral" },
  { key: ["PENDING_MANAGER", "PENDING_FINANCE"], label: "Awaiting approval", tone: "warning" },
  { key: ["APPROVED"], label: "Approved", tone: "info" },
  { key: ["SENT", "UNDER_NEGOTIATION"], label: "With customer", tone: "info" },
  { key: ["CONFIRMED"], label: "Confirmed", tone: "success" },
  { key: ["REJECTED", "CANCELLED"], label: "Closed", tone: "danger" },
];

export default async function PipelinePage() {
  const user = await requireUserPage("/workspace");
  const quotations = await listQuotations(user);

  const totalValue = quotations
    .filter((q) => q.status === "CONFIRMED")
    .reduce((sum, q) => sum + Number(q.total), 0);
  const awaiting = quotations.filter(
    (q) => q.status === "PENDING_MANAGER" || q.status === "PENDING_FINANCE",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        subtitle={`${quotations.length} quotation${quotations.length === 1 ? "" : "s"} in view`}
        actions={
          <Link href="/workspace/quotations/new">
            <Button>
              <Plus className="size-4" />
              New quotation
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Quotations" value={quotations.length} />
        <StatTile label="Awaiting approval" value={awaiting} />
        <StatTile label="Confirmed value" value={formatMoney(totalValue)} />
      </div>

      {quotations.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No quotations yet"
          description="Create a quotation to see it move through the pipeline."
        />
      ) : (
        <div className="grid gap-4 overflow-x-auto pb-2 lg:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const inStage = quotations.filter((q) => stage.key.includes(q.status));
            return (
              <section key={stage.label} className="min-w-[240px] space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {stage.label}
                  </h2>
                  <span className="text-xs tabular-nums text-neutral-500">{inStage.length}</span>
                </div>

                <div className="space-y-2">
                  {inStage.map((q) => (
                    <Link key={q.id} href={`/workspace/quotations/${q.id}`} className="block">
                      <Card className="transition hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700">
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {q.customer.name}
                            </span>
                            <Badge tone={q.customer.tier === "GOLD" ? "warning" : "neutral"}>
                              {q.customer.tier}
                            </Badge>
                          </div>
                          <p className="font-mono text-xs text-neutral-500">{q.number}</p>
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                              {formatMoney(Number(q.total))}
                            </span>
                            {Number(q.riskScore) > 0 ? (
                              <Badge tone={Number(q.riskScore) >= 5 ? "danger" : "warning"}>
                                risk {Number(q.riskScore)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-neutral-500">
                            {q._count.lines} line{q._count.lines === 1 ? "" : "s"} · {q.owner.name}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                  {inStage.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400 dark:border-neutral-800">
                      Nothing here
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatMoney(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}
