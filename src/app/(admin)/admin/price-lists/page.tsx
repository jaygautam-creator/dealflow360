import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createPriceList, deletePriceList, updatePriceList } from "./actions";

export const metadata = { title: "Price Lists" };

export default async function PriceListsPage() {
  const priceLists = await prisma.priceList.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });

  const rows = priceLists.map((pl) => ({
    id: pl.id,
    name: pl.name,
    tier: pl.tier ?? "",
    currency: pl.currency,
    itemCount: String(pl._count.items),
  }));

  return (
    <EntityManager
      title="Price Lists"
      subtitle="A price list with no tier is the default, applied when no tier-specific list matches. Open a list's item screen to set per-product prices."
      emptyLabel="No price lists yet"
      rows={rows}
      columns={[
        { key: "name", header: "Name" },
        {
          key: "tier",
          header: "Tier",
          kind: "badge",
          toneMap: { GOLD: "warning", SILVER: "neutral", BRONZE: "info", "": "neutral" },
          labelMap: { "": "Default (all tiers)" },
        },
        { key: "currency", header: "Currency" },
        { key: "itemCount", header: "Items" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        {
          name: "tier",
          label: "Tier (blank = default list)",
          type: "select",
          options: [
            { value: "", label: "Default (all tiers)" },
            ...Object.values(CustomerTier).map((t) => ({ value: t, label: t })),
          ],
        },
        { name: "currency", label: "Currency", type: "text", required: true },
      ]}
      createAction={createPriceList}
      updateAction={updatePriceList}
      deleteAction={deletePriceList}
      detailLink={{ hrefBase: "/admin/price-lists", label: "Items" }}
    />
  );
}
