import Link from "next/link";
import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import {
  APPROVAL_STATUS_VALUES,
  PERIOD_VALUES,
  approvalStatusLabel,
  listCategories,
  listSalesReps,
  parseReportFilters,
  runReport,
  type ReportFilters,
} from "@/application/reportsQuery";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { QuotationStatus } from "@/generated/prisma";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermissionPage(P.DASHBOARD_VIEW, "/workspace/reports");
  const raw = await searchParams;
  const filters = parseReportFilters(raw);

  const [{ rows, summary }, reps, categories] = await Promise.all([
    runReport(user, filters),
    listSalesReps(),
    listCategories(),
  ]);

  const qs = toQueryString(filters);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle={`${summary.count} quotation${summary.count === 1 ? "" : "s"} matching filters`} />

      <Card>
        <CardContent>
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5" method="get">
            <Select label="Period" name="period" defaultValue={filters.period}>
              {PERIOD_VALUES.map((p) => (
                <option key={p} value={p}>
                  {p === "custom" ? "Custom range" : `This ${p === "today" ? "day" : p}`.replace("This day", "Today")}
                </option>
              ))}
            </Select>
            <Input label="From" type="date" name="from" defaultValue={filters.from ?? ""} />
            <Input label="To" type="date" name="to" defaultValue={filters.to ?? ""} />
            <Select label="Sales rep" name="repId" defaultValue={filters.repId ?? ""}>
              <option value="">All reps</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Select label="Approval status" name="approvalStatus" defaultValue={filters.approvalStatus}>
              {APPROVAL_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
            <Select label="Product category" name="categoryId" defaultValue={filters.categoryId ?? ""}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
              <Button type="submit">Apply filters</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Quotations" value={String(summary.count)} />
        <StatTile label="Total value" value={money(summary.totalValuePaise)} />
        <StatTile label="Avg. discount" value={`${summary.averageDiscountPct.toFixed(1)}%`} />
        <StatTile label="Avg. risk score" value={summary.averageRiskScore.toFixed(1)} />
        <StatTile label="Approval rate" value={`${summary.approvalRatePct.toFixed(1)}%`} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700">Results</h2>
        <div className="flex gap-2">
          <a
            href={`/api/reports/export?${qs}&format=csv`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Export CSV
          </a>
          <a
            href={`/api/reports/export?${qs}&format=xls`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Export XLS
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No quotations match these filters" description="Try widening the period or clearing a filter." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Number</TH>
                  <TH>Customer</TH>
                  <TH>Owner</TH>
                  <TH>Stage</TH>
                  <TH className="text-right">Risk</TH>
                  <TH className="text-right">Discount</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link href={`/workspace/quotations/${row.id}`} className="font-mono text-xs font-medium text-indigo-600 hover:underline">
                        {row.number}
                      </Link>
                    </TD>
                    <TD>{row.customerName}</TD>
                    <TD>{row.ownerName}</TD>
                    <TD>
                      <Badge tone={statusTone(row.status)}>{row.status.replaceAll("_", " ").toLowerCase()}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{row.riskScore.toFixed(1)}</TD>
                    <TD className="text-right tabular-nums">{row.discountPct.toFixed(1)}%</TD>
                    <TD className="text-right font-medium tabular-nums">{money(row.totalPaise)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function statusTone(status: QuotationStatus): BadgeTone {
  const label = approvalStatusLabel(status);
  if (label === "approved") return "success";
  if (label === "rejected") return "danger";
  if (label === "pending") return "warning";
  return "neutral";
}

function toQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();
  params.set("period", filters.period);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.repId) params.set("repId", filters.repId);
  params.set("approvalStatus", filters.approvalStatus);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  return params.toString();
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}
