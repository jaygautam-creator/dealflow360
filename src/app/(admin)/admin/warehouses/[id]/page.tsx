import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../../_components/EntityManager";
import { createStockLevel, deleteStockLevel, updateStockLevel } from "./actions";

export default async function WarehouseStockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  if (!warehouse) notFound();

  const stockLevels = await prisma.stockLevel.findMany({
    where: { warehouseId: id },
    include: { product: true },
    orderBy: { product: { sku: "asc" } },
  });

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { sku: "asc" },
  });

  const rows = stockLevels.map((s) => ({
    id: s.id,
    productId: s.productId,
    product: `${s.product.sku} — ${s.product.name}`,
    quantity: String(s.quantity),
    reorderPoint: String(s.reorderPoint),
    lowStock: s.quantity <= s.reorderPoint,
  }));

  return (
    <div>
      <Link
        href="/admin/warehouses"
        className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="size-4" /> Warehouses
      </Link>
      <PageHeader
        title={`Stock — ${warehouse.name}`}
        subtitle={`Warehouse code ${warehouse.code}. The fulfilment planner reads these levels to decide which warehouse ships which line.`}
      />
      <EntityManager
        title="Stock Levels"
        emptyLabel="No stock recorded for this warehouse yet"
        rows={rows}
        columns={[
          { key: "product", header: "Product" },
          { key: "quantity", header: "Quantity" },
          { key: "reorderPoint", header: "Reorder point" },
          {
            key: "lowStock",
            header: "Status",
            kind: "badge",
            toneMap: { true: "danger", false: "success" },
            labelMap: { true: "Below reorder point", false: "OK" },
          },
        ]}
        fields={[
          {
            name: "productId",
            label: "Product",
            type: "select",
            required: true,
            options: products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
          },
          { name: "quantity", label: "Quantity", type: "number", step: "1", required: true },
          {
            name: "reorderPoint",
            label: "Reorder point",
            type: "number",
            step: "1",
            required: true,
          },
        ]}
        createAction={createStockLevel.bind(null, id)}
        updateAction={updateStockLevel}
        deleteAction={deleteStockLevel}
      />
    </div>
  );
}
