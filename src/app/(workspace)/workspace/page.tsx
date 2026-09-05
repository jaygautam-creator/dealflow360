import Link from "next/link";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { listQuotations } from "@/application/queries";
import { dbToPaise, paiseToDb } from "@/infrastructure/money";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
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

/** Cards rendered per lane before the board defers to the quotations table. */
const CARDS_PER_LANE = 12;

export default async function PipelinePage() {
  const user = await requireUserPage("/workspace");
  const quotations = await listQuotations(user);

  // Finance approves and bills; it does not raise quotations. Rendering the button to a
  // role whose guard will refuse it is how a permission boundary reads as a broken feature.
  const canCreate = can(user.role, P.QUOTATION_CREATE);

  // Summed in integer paise and crossed back to rupees once, rather than adding rupee
  // floats row by row. formatMoney below takes rupees, so the conversion belongs here.
  const totalValue = paiseToDb(
    quotations
      .filter((q) => q.status === "CONFIRMED")
      .reduce((sum, q) => sum + dbToPaise(q.total), 0),
  );
  const awaiting = quotations.filter(
    (q) => q.status === "PENDING_MANAGER" || q.status === "PENDING_FINANCE",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        subtitle={`${quotations.length} quotation${quotations.length === 1 ? "" : "s"} in view`}
        actions={
          canCreate ? (
            <Link href="/workspace/quotations/new">
              <Button>
                <Plus className="size-4" />
                New quotation
              </Button>
            </Link>
          ) : null
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
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="flex min-w-max gap-4">
            {STAGES.map((stage) => {
              const inStage = quotations.filter((q) => stage.key.includes(q.status));
              // A board is for triage, not for storage. Rendering every card in a lane
              // put 400 DOM nodes on the page and made the column unscrollable in
              // practice; the count badge above already carries the true total, so the
              // lane shows the newest few and says how many it is standing in for.
              const shown = inStage.slice(0, CARDS_PER_LANE);
              const hidden = inStage.length - shown.length;
              return (
                <section key={stage.label} className="flex w-64 shrink-0 flex-col rounded-xl bg-neutral-100/70 p-2">
                  <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                      {stage.label}
                    </h2>
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-medium tabular-nums text-neutral-500">
                      {inStage.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {shown.map((q) => (
                      <Link key={q.id} href={`/workspace/quotations/${q.id}`} className="block">
                        <Card className="flex h-[132px] flex-col justify-between transition hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700">
                          <CardContent className="flex flex-1 flex-col justify-between gap-2 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100"
                                title={q.customer.name}
                              >
                                {q.customer.name}
                              </span>
                              <Badge className="shrink-0" tone={q.customer.tier === "GOLD" ? "warning" : "neutral"}>
                                {q.customer.tier}
                              </Badge>
                            </div>
                            <p className="truncate font-mono text-xs text-neutral-500">{q.number}</p>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                                {formatMoney(Number(q.total))}
                              </span>
                              {Number(q.riskScore) > 0 ? (
                                <Badge className="shrink-0" tone={Number(q.riskScore) >= 5 ? "danger" : "warning"}>
                                  risk {Number(q.riskScore)}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-neutral-500">
                              {q._count.lines} line{q._count.lines === 1 ? "" : "s"} · {q.owner.name}
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                    {/* An empty lane is information, not a problem, so it whispers rather
                        than drawing a full-size dashed box the eye keeps returning to. */}
                    {hidden > 0 ? (
                      <Link
                        href={`/workspace/quotations`}
                        className="block px-1.5 py-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        + {hidden} more in this stage
                      </Link>
                    ) : null}
                    {inStage.length === 0 ? (
                      <p className="px-1.5 py-3 text-xs text-neutral-400">Nothing here</p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
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
