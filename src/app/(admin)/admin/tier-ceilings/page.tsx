import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createTierCeiling, deleteTierCeiling, updateTierCeiling } from "./actions";

export default async function TierCeilingsPage() {
  const ceilings = await prisma.tierDiscountCeiling.findMany({ orderBy: { tier: "asc" } });

  const rows = ceilings.map((c) => ({
    id: c.id,
    tier: c.tier,
    maxDiscountPct: c.maxDiscountPct.toString(),
  }));

  const configuredTiers = new Set(rows.map((r) => r.tier));
  const tierOptions = Object.values(CustomerTier).map((tier) => ({
    value: tier,
    label: configuredTiers.has(tier) ? `${tier} (already configured)` : tier,
  }));

  return (
    <EntityManager
      title="Tier Ceilings"
      subtitle="Maximum discount a customer's tier alone permits. The risk engine also checks the product category's ceiling and takes whichever is stricter."
      emptyLabel="No tier ceilings configured. Every tier is treated as unlimited."
      rows={rows}
      columns={[
        { key: "tier", header: "Tier" },
        {
          key: "maxDiscountPct",
          header: "Max discount",
          render: (row) => `${row.maxDiscountPct}%`,
        },
      ]}
      fields={[
        { name: "tier", label: "Tier", type: "select", options: tierOptions, required: true },
        {
          name: "maxDiscountPct",
          label: "Max discount %",
          type: "number",
          step: "0.01",
          required: true,
        },
      ]}
      toFormValues={(row) => ({ tier: row.tier, maxDiscountPct: row.maxDiscountPct })}
      createAction={createTierCeiling}
      updateAction={updateTierCeiling}
      deleteAction={deleteTierCeiling}
    />
  );
}
