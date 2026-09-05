import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../../_components/EntityManager";
import { createPriceListItem, deletePriceListItem, updatePriceListItem } from "./actions";

export default async function PriceListItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const priceList = await prisma.priceList.findUnique({ where: { id } });
  if (!priceList) notFound();

  const [items, products] = await Promise.all([
    prisma.priceListItem.findMany({
      where: { priceListId: id },
      include: { product: true },
      orderBy: { product: { sku: "asc" } },
    }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { sku: "asc" } }),
  ]);

  const rows = items.map((i) => ({
    id: i.id,
    productId: i.productId,
    product: `${i.product.sku} — ${i.product.name}`,
    price: i.price.toString(),
    listPrice: i.product.listPrice.toString(),
  }));

  return (
    <div>
      <Link
        href="/admin/price-lists"
        className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="size-4" /> Price Lists
      </Link>
      <PageHeader
        title={`Items — ${priceList.name}`}
        subtitle={`${priceList.tier ?? "Default"} / ${priceList.currency}. A quotation line resolves its price from here at the moment it's added, so later edits never rewrite an existing quotation.`}
      />
      <EntityManager
        title="Price List Items"
        emptyLabel="No prices set on this list yet"
        rows={rows}
        columns={[
          { key: "product", header: "Product" },
          { key: "listPrice", header: "Catalogue list price" },
          { key: "price", header: "Price on this list" },
        ]}
        fields={[
          {
            name: "productId",
            label: "Product",
            type: "select",
            required: true,
            options: products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
          },
          { name: "price", label: "Price", type: "number", step: "0.01", required: true },
        ]}
        createAction={createPriceListItem.bind(null, id)}
        updateAction={updatePriceListItem}
        deleteAction={deletePriceListItem}
      />
    </div>
  );
}
