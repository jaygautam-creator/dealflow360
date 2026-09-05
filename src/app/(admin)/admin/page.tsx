import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { prisma } from "@/infrastructure/db";

const SECTIONS = [
  {
    href: "/admin/products",
    title: "Products",
    description: "Catalogue, pricing, cost and variants.",
  },
  {
    href: "/admin/categories",
    title: "Categories",
    description: "Per-category discount ceilings.",
  },
  {
    href: "/admin/price-lists",
    title: "Price Lists",
    description: "Tier-specific and default pricing.",
  },
  {
    href: "/admin/tier-ceilings",
    title: "Tier Ceilings",
    description: "Maximum discount permitted per customer tier.",
  },
  {
    href: "/admin/approval-rules",
    title: "Approval Rules",
    description: "Score bands that route quotations to manager/finance.",
  },
  {
    href: "/admin/risk-config",
    title: "Risk Config",
    description: "The tunables the risk and health engines read live.",
  },
  {
    href: "/admin/warehouses",
    title: "Warehouses",
    description: "Fulfilment sources and stock levels.",
  },
  {
    href: "/admin/subscription-plans",
    title: "Subscription Plans",
    description: "Billing intervals, proration and refund policy.",
  },
  {
    href: "/admin/upsell-rules",
    title: "Upsell Rules",
    description: "Co-purchase suggestions and margin floors.",
  },
];

export default async function AdminOverviewPage() {
  const [productCount, categoryCount, approvalRuleCount, warehouseCount] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.productCategory.count(),
    prisma.approvalRule.count(),
    prisma.warehouse.count({ where: { isActive: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Sales Backend"
        subtitle="Every rule the domain engines apply lives here as data, not code. Change a row and the very next quotation behaves differently — no redeploy."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Active products" value={productCount} />
        <StatTile label="Categories" value={categoryCount} />
        <StatTile label="Approval rules" value={approvalRuleCount} />
        <StatTile label="Active warehouses" value={warehouseCount} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
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
