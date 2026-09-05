import Link from "next/link";
import { AlertTriangle, Clock, PackageX, TrendingUp } from "lucide-react";
import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { buildHealthReport } from "@/application/healthService";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PipelineChart } from "./PipelineChart";

export const metadata = { title: "Deal health — DealFlow360" };
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  await requirePermissionPage(P.DASHBOARD_VIEW, "/workspace/health");
  const report = await buildHealthReport();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deal health"
        subtitle={`Stalled after ${report.config.stalledAfterDays} days · anomalies at ${report.config.anomalyZThreshold}σ · all thresholds configurable`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open quotations" value={report.kpis.openQuotations} />
        <StatTile label="Awaiting approval" value={report.kpis.awaitingApproval} />
        <StatTile label="Open pipeline value" value={money(report.kpis.openValue)} />
        <StatTile label="Average risk score" value={report.kpis.averageRiskScore} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Anomalies come first: they are the only alert here that implies someone may be
            doing something they should not, so they earn the top-left position. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              Discount anomalies
              {report.anomalies.length > 0 ? <Badge tone="danger">{report.anomalies.length}</Badge> : null}
            </CardTitle>
            <p className="mt-1 text-xs text-neutral-500">
              Each rep is compared against their own history, not a company-wide threshold.
            </p>
          </CardHeader>
          <CardContent>
            {report.anomalies.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No rep is discounting unusually for their own pattern.
              </p>
            ) : (
              <ul className="space-y-3">
                {report.anomalies.map((a) => (
                  <li key={a.id}>
                    <Link href={`/workspace/quotations/${a.id}`} className="block rounded-lg border border-red-200 bg-red-50/50 p-3 transition hover:border-red-300 dark:border-red-900 dark:bg-red-950/20">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs text-neutral-500">{a.number}</span>
                          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {a.customerName} · {a.ownerName}
                          </div>
                        </div>
                        <Badge tone="danger">{a.discountPct}%</Badge>
                      </div>
                      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{a.explanation}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4" />
              Stalled deals
              {report.stalled.length > 0 ? <Badge tone="warning">{report.stalled.length}</Badge> : null}
            </CardTitle>
            <p className="mt-1 text-xs text-neutral-500">
              Open quotations with no activity for {report.config.stalledAfterDays} days or more.
            </p>
          </CardHeader>
          <CardContent>
            {report.stalled.length === 0 ? (
              <p className="text-sm text-neutral-500">Every open deal has been touched recently.</p>
            ) : (
              <ul className="space-y-2">
                {report.stalled.map((s) => (
                  <li key={s.id}>
                    <Link href={`/workspace/quotations/${s.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 transition hover:border-amber-300 dark:border-neutral-800">
                      <div>
                        <span className="font-mono text-xs text-neutral-500">{s.number}</span>
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {s.customerName}
                        </div>
                        <p className="text-xs text-neutral-500">{s.ownerName} · {money(s.total)}</p>
                      </div>
                      <Badge tone="warning">{s.daysInactive}d idle</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pipeline by stage</CardTitle></CardHeader>
          <CardContent>
            <PipelineChart data={report.byStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="size-4" />By sales rep</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                  <th className="pb-2 font-medium">Rep</th>
                  <th className="pb-2 text-right font-medium">Deals</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                  <th className="pb-2 text-right font-medium">Avg disc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {report.byOwner.map((o) => (
                  <tr key={o.ownerName}>
                    <td className="py-2 text-neutral-900 dark:text-neutral-100">{o.ownerName}</td>
                    <td className="py-2 text-right tabular-nums">{o.count}</td>
                    <td className="py-2 text-right tabular-nums">{money(o.value)}</td>
                    <td className="py-2 text-right tabular-nums">{o.averageDiscount}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {report.backorders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PackageX className="size-4" />Backorders</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {report.backorders.map((b, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-800 dark:text-neutral-200">
                    <span className="font-mono text-xs text-neutral-500">{b.orderNumber}</span> · {b.productName}
                  </span>
                  <Badge tone="warning">{b.quantity} awaiting stock</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {report.anomalies.length === 0 && report.stalled.length === 0 && report.backorders.length === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          description="No stalled deals, no discount anomalies, and no backorders outstanding."
        />
      ) : null}
    </div>
  );
}

function money(rupees: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(rupees);
}
