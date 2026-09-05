import { dbToPct } from "@/infrastructure/money";
import { prisma } from "@/infrastructure/db";
import { DEFAULT_MONTH_END_POLICY } from "@/domain/promotion/monthEnd";
import { EntityManager } from "../_components/EntityManager";
import {
  createMonthEndPromotion,
  deleteMonthEndPromotion,
  updateMonthEndPromotion,
} from "./actions";

export const metadata = { title: "Month-End Offers" };
export const dynamic = "force-dynamic";

export default async function MonthEndOffersPage() {
  const promotions = await prisma.monthEndPromotion.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });

  const rows = promotions.map((p) => ({
    id: p.id,
    name: p.name,
    windowDays: String(p.windowDays),
    bonusDiscountPct: String(dbToPct(p.bonusDiscountPct)),
    maxGiftShareOfOrderPct: String(dbToPct(p.maxGiftShareOfOrderPct)),
    isActive: p.isActive ? "ACTIVE" : "INACTIVE",
  }));

  const d = DEFAULT_MONTH_END_POLICY;

  return (
    <EntityManager
      title="Month-End Offers"
      subtitle={
        `Extra discount and a free accessory for deals closing in the last days of the month. ` +
        `The bonus is always trimmed to the product category's own ceiling, so raising it here ` +
        `can never push a line past discount policy. With no active row the engine uses its ` +
        `defaults: ${d.windowDays} days, ${d.bonusDiscountPct}%, ${d.maxGiftShareOfOrderPct}% gift budget.`
      }
      emptyLabel={
        `No promotion configured. The offer still runs on the built-in defaults ` +
        `(${d.windowDays} days, ${d.bonusDiscountPct}% bonus) — add a row to override them.`
      }
      rows={rows}
      columns={[
        { key: "name", header: "Name" },
        { key: "windowDays", header: "Window (days)" },
        { key: "bonusDiscountPct", header: "Bonus", kind: "percent" },
        { key: "maxGiftShareOfOrderPct", header: "Gift budget", kind: "percent" },
        {
          key: "isActive",
          header: "State",
          kind: "badge",
          toneMap: { ACTIVE: "success", INACTIVE: "neutral" },
          labelMap: { ACTIVE: "active", INACTIVE: "inactive" },
        },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "windowDays", label: "Days before month end", type: "number", step: "1", required: true },
        { name: "bonusDiscountPct", label: "Bonus discount %", type: "number", step: "0.01", required: true },
        { name: "maxGiftShareOfOrderPct", label: "Max gift % of order", type: "number", step: "0.01", required: true },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      createAction={createMonthEndPromotion}
      updateAction={updateMonthEndPromotion}
      deleteAction={deleteMonthEndPromotion}
    />
  );
}
