import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getSession } from "@/infrastructure/auth/session";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { dbToPct } from "@/infrastructure/money";
import { prisma } from "@/infrastructure/db";

const SECTIONS = [
  {
    href: "/admin/products",
    title: "Products",
    description: "Catalogue, pricing, cost and variants.",
    permission: P.CONFIG_MANAGE,
  },
  {
    href: "/admin/categories",
    title: "Categories",
    description: "Per-category discount ceilings.",
    permission: P.CONFIG_MANAGE,
  },
  {
    href: "/admin/price-lists",
    title: "Price Lists",
    description: "Tier-specific and default pricing.",
    permission: P.CONFIG_MANAGE,
  },
  {
    href: "/admin/tier-ceilings",
    title: "Tier Ceilings",
    description: "Maximum discount permitted per customer tier.",
    permission: P.CONFIG_APPROVAL_CHAIN,
  },
  {
    href: "/admin/approval-rules",
    title: "Approval Rules",
    description: "Score bands that route quotations to manager/finance.",
    permission: P.CONFIG_APPROVAL_CHAIN,
  },
  {
    href: "/admin/risk-config",
    title: "Risk Config",
    description: "The tunables the risk and health engines read live.",
    permission: P.CONFIG_APPROVAL_CHAIN,
  },
  {
    href: "/admin/warehouses",
    title: "Warehouses",
    description: "Fulfilment sources and stock levels.",
    permission: P.CONFIG_MANAGE,
  },
  {
    href: "/admin/subscription-plans",
    title: "Subscription Plans",
    description: "Billing intervals, proration and refund policy.",
    permission: P.CONFIG_MANAGE,
  },
  {
    href: "/admin/upsell-rules",
    title: "Upsell Rules",
    description: "Co-purchase suggestions and margin floors.",
    permission: P.CONFIG_MANAGE,
  },
] as const;

export const metadata = { title: "Configuration" };

export default async function AdminOverviewPage() {
  const user = await getSession();
  const mayConfigure = user ? can(user.role, P.CONFIG_MANAGE) : false;

  const [
    productCount,
    categoryCount,
    warehouseCount,
    tierCeilings,
    approvalRules,
    riskConfig,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.productCategory.count(),
    prisma.warehouse.count({ where: { isActive: true } }),
    prisma.tierDiscountCeiling.findMany({ orderBy: { tier: "asc" } }),
    prisma.approvalRule.findMany({ orderBy: { sequence: "asc" } }),
    prisma.riskConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    }),
  ]);

  const sections = SECTIONS.filter(
    (section) => user && can(user.role, section.permission),
  );

  return (
    <div>
      <PageHeader
        title="Sales Backend"
        subtitle="Every rule the domain engines apply lives here as data, not code. Change a row and the very next quotation behaves differently — no redeploy."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active products" value={productCount} />
        <StatTile label="Categories" value={categoryCount} />
        <StatTile label="Approval rules" value={approvalRules.length} />
        <StatTile label="Active warehouses" value={warehouseCount} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Governance policy — the whole thing on one screen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Tier ceilings
            </h4>
            {tierCeilings.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No tier ceilings configured — every tier is treated as unlimited.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tierCeilings.map((c) => (
                  <Badge key={c.id} tone="info">
                    {c.tier} ≤ {dbToPct(c.maxDiscountPct)}%
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Approval bands
            </h4>
            {approvalRules.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No approval rules configured — every quotation routes with no approval
                required.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Score range</TH>
                    <TH>Manager</TH>
                    <TH>Finance</TH>
                  </TR>
                </THead>
                <TBody>
                  {approvalRules.map((r) => (
                    <TR key={r.id}>
                      <TD>{r.name}</TD>
                      <TD>
                        {r.minScore.toString()} – {r.maxScore?.toString() ?? "∞"}
                      </TD>
                      <TD>
                        <Badge tone={r.requiresManager ? "info" : "neutral"}>
                          {r.requiresManager ? "Required" : "—"}
                        </Badge>
                      </TD>
                      <TD>
                        <Badge tone={r.requiresFinance ? "warning" : "neutral"}>
                          {r.requiresFinance ? "Required" : "—"}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Risk engine tunables
            </h4>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">
                Aggregate amplifier {riskConfig.aggregateAmplifier.toString()}x
              </Badge>
              <Badge tone="neutral">Stalled after {riskConfig.stalledAfterDays}d</Badge>
              <Badge tone="neutral">
                Anomaly z-threshold {riskConfig.anomalyZThreshold.toString()}σ
              </Badge>
              <Badge tone="neutral">
                Anomaly min samples {riskConfig.anomalyMinSamples}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {!mayConfigure && (
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Your role manages approval routing, tier ceilings and risk tuning. The product
          catalogue, price lists, warehouses and other configuration screens require full
          configuration access.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:border-indigo-400 dark:hover:border-indigo-600">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {section.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
