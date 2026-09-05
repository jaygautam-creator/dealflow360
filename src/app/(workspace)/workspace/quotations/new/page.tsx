import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { prisma } from "@/infrastructure/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { NewQuotationForm } from "./NewQuotationForm";

export const metadata = { title: "New quotation" };
export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  await requirePermissionPage(P.QUOTATION_CREATE, "/workspace/quotations/new");

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, tier: true, city: true },
    orderBy: { name: "asc" },
  });

  const ceilings = await prisma.tierDiscountCeiling.findMany();
  const ceilingByTier = Object.fromEntries(ceilings.map((c) => [c.tier, Number(c.maxDiscountPct)]));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="New quotation"
        subtitle="Pick the customer first — their tier sets the discount ceiling for every line."
      />
      <NewQuotationForm
        customers={customers.map((c) => ({
          ...c,
          ceilingPct: ceilingByTier[c.tier] ?? 0,
        }))}
      />
    </div>
  );
}
