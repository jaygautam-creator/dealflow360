import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/infrastructure/db";
import { dbToPct } from "@/infrastructure/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RiskAssessment } from "@/domain/risk/types";

export const metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

/**
 * The approval queue.
 *
 * Split into "waiting for you" and "waiting for someone else" rather than one undivided
 * list, because the first question an approver has is never "what is outstanding" — it is
 * "what is outstanding *on me*". Each row leads with why the quotation was flagged, so an
 * approver can triage without opening anything.
 */
export default async function ApprovalsPage() {
  const user = await requireUserPage("/workspace/approvals");
  if (!can(user.role, P.APPROVE_AS_MANAGER) && !can(user.role, P.APPROVE_AS_FINANCE)) {
    redirect("/workspace");
  }

  const pending = await prisma.quotation.findMany({
    where: { approvalSteps: { some: { status: "PENDING" } } },
    include: {
      customer: { select: { name: true, tier: true } },
      owner: { select: { id: true, name: true } },
      approvalSteps: { where: { status: "PENDING" }, orderBy: { sequence: "asc" } },
    },
    orderBy: { riskScore: "desc" },
  });

  // Asked per step, not resolved to a single "my level" up front. An ADMIN holds both
  // APPROVE_AS_FINANCE and APPROVE_AS_MANAGER, so a ternary picking one of them silently
  // dropped every manager-level item out of "Waiting on you" — the queue looked empty
  // while work was genuinely outstanding on that person.
  const canApproveAt = (level: string) =>
    level === "FINANCE"
      ? can(user.role, P.APPROVE_AS_FINANCE)
      : can(user.role, P.APPROVE_AS_MANAGER);

  // Only the earliest pending step is actionable, and never on your own quotation.
  const actionable = pending.filter((q) => {
    const step = q.approvalSteps[0];
    return step !== undefined && canApproveAt(step.level) && q.ownerId !== user.id;
  });
  const others = pending.filter((q) => !actionable.includes(q));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        subtitle={`${actionable.length} waiting on you · ${others.length} elsewhere in the chain`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="size-4" />
            Waiting on you
            {actionable.length > 0 ? <Badge tone="warning">{actionable.length}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {actionable.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing is waiting for your decision.</p>
          ) : (
            <ul className="space-y-2">
              {actionable.map((q) => <Row key={q.id} q={q} actionable />)}
            </ul>
          )}
        </CardContent>
      </Card>

      {others.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Elsewhere in the chain</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">{others.map((q) => <Row key={q.id} q={q} />)}</ul>
          </CardContent>
        </Card>
      ) : null}

      {pending.length === 0 ? (
        <EmptyState
          title="The approval queue is empty"
          description="Every quotation is either within policy or already decided."
        />
      ) : null}
    </div>
  );
}

type PendingQuotation = {
  id: string; number: string; riskScore: unknown; total: unknown; riskTrace: unknown;
  customer: { name: string; tier: string }; owner: { name: string };
  approvalSteps: { level: string }[];
};

function Row({ q, actionable = false }: { q: PendingQuotation; actionable?: boolean }) {
  const score = dbToPct(q.riskScore as never);
  const trace = q.riskTrace as unknown as RiskAssessment | null;
  const worst = trace?.lines?.reduce((w, l) => (l.breachPts > (w?.breachPts ?? 0) ? l : w), trace.lines[0]);

  return (
    <li>
      <Link
        href={`/workspace/quotations/${q.id}`}
        className={`block rounded-lg border p-3 transition ${
          actionable ? "border-amber-200 bg-amber-50/40 hover:border-amber-300" : "border-neutral-200 hover:border-neutral-300"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-neutral-500">{q.number}</span>
              <span className="text-sm font-medium text-neutral-900">{q.customer.name}</span>
              <Badge tone="neutral">{q.customer.tier}</Badge>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {q.owner.name} · needs {q.approvalSteps[0]?.level === "FINANCE" ? "finance" : "sales manager"}
            </p>
            {/* Leading with the reason lets an approver triage the queue without opening
                anything, which is the whole point of a queue. */}
            {worst && worst.breachPts > 0 ? (
              <p className="mt-1 text-xs text-neutral-600">
                {worst.productName} is {worst.breachPts} points over its {worst.effectiveCeilingPct}% ceiling
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <div className={`text-lg font-semibold tabular-nums ${score >= 5 ? "text-red-600" : "text-amber-600"}`}>
              {score}
            </div>
            <div className="text-xs tabular-nums text-neutral-500">{money(Number(q.total))}</div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function money(r: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(r);
}
