import { dbToPct } from "@/infrastructure/money";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createUpsellRule, deleteUpsellRule, updateUpsellRule } from "./actions";

export default async function UpsellRulesPage() {
  const [rules, products] = await Promise.all([
    prisma.upsellRule.findMany({
      include: { triggerProduct: true, suggestedProduct: true },
      orderBy: { coPurchaseScore: "desc" },
    }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { sku: "asc" } }),
  ]);

  const rows = rules.map((r) => ({
    id: r.id,
    triggerProductId: r.triggerProductId,
    suggestedProductId: r.suggestedProductId,
    trigger: `${r.triggerProduct.sku} — ${r.triggerProduct.name}`,
    suggested: `${r.suggestedProduct.sku} — ${r.suggestedProduct.name}`,
    coPurchaseScore: r.coPurchaseScore.toString(),
    minMarginPct: String(dbToPct(r.minMarginPct)),
  }));

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.sku} — ${p.name}`,
  }));

  return (
    <EntityManager
      title="Upsell Rules"
      subtitle="When the trigger product is on a quotation, the suggested product is ranked as an upsell — unless adding it would drop the line margin below the floor."
      emptyLabel="No upsell rules configured"
      rows={rows}
      columns={[
        { key: "trigger", header: "When adding" },
        { key: "suggested", header: "Suggest" },
        { key: "coPurchaseScore", header: "Co-purchase score" },
        { key: "minMarginPct", header: "Min margin", kind: "percent" },
      ]}
      fields={[
        {
          name: "triggerProductId",
          label: "Trigger product",
          type: "select",
          required: true,
          options: productOptions,
        },
        {
          name: "suggestedProductId",
          label: "Suggested product",
          type: "select",
          required: true,
          options: productOptions,
        },
        {
          name: "coPurchaseScore",
          label: "Co-purchase score",
          type: "number",
          step: "0.01",
          required: true,
          hint: "How often these two were bought together historically. Drives ranking.",
        },
        {
          name: "minMarginPct",
          label: "Minimum margin %",
          type: "number",
          step: "0.01",
          required: true,
          hint: "Suggestion is suppressed if adding it would drop the line margin below this.",
        },
      ]}
      createAction={createUpsellRule}
      updateAction={updateUpsellRule}
      deleteAction={deleteUpsellRule}
    />
  );
}
