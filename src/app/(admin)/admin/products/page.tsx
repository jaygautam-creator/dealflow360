import { ProductKind } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createProduct, deleteProduct, updateProduct } from "./actions";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const [products, categories, plans] = await Promise.all([
    prisma.product.findMany({ include: { category: true }, orderBy: { sku: "asc" } }),
    prisma.productCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.subscriptionPlan.findMany({ orderBy: { name: "asc" } }),
  ]);

  const rows = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description ?? "",
    category: p.category.name,
    categoryId: p.categoryId,
    kind: p.kind,
    listPrice: p.listPrice.toString(),
    cost: p.cost.toString(),
    taxPct: p.taxPct.toString(),
    uom: p.uom,
    isPromoted: p.isPromoted,
    isActive: p.isActive,
    defaultPlanId: p.defaultPlanId ?? "",
  }));

  return (
    <EntityManager
      title="Products"
      subtitle="Catalogue items priced and costed for the margin engine. Open a row's variant screen from the product detail page to manage size/color-style variants."
      emptyLabel="No products yet"
      rows={rows}
      columns={[
        { key: "sku", header: "SKU" },
        { key: "name", header: "Name" },
        { key: "category", header: "Category" },
        { key: "kind", header: "Kind" },
        { key: "listPrice", header: "List price" },
        { key: "cost", header: "Cost" },
        {
          key: "isActive",
          header: "Status",
          kind: "badge",
          toneMap: { true: "success", false: "neutral" },
          labelMap: { true: "Active", false: "Inactive" },
        },
      ]}
      fields={[
        { name: "sku", label: "SKU", type: "text", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        { name: "description", label: "Description", type: "textarea" },
        {
          name: "categoryId",
          label: "Category",
          type: "select",
          required: true,
          options: categories.map((c) => ({ value: c.id, label: c.name })),
        },
        {
          name: "kind",
          label: "Kind",
          type: "select",
          required: true,
          options: Object.values(ProductKind).map((v) => ({ value: v, label: v })),
        },
        { name: "listPrice", label: "List price", type: "number", step: "0.01", required: true },
        {
          name: "cost",
          label: "Cost",
          type: "number",
          step: "0.01",
          required: true,
          hint: "Drives live margin. Never shown to portal users.",
        },
        { name: "taxPct", label: "Tax %", type: "number", step: "0.01", required: true },
        { name: "uom", label: "Unit of measure", type: "text", required: true },
        {
          name: "defaultPlanId",
          label: "Default subscription plan (optional)",
          type: "select",
          options: [
            { value: "", label: "None" },
            ...plans.map((p) => ({ value: p.id, label: p.name })),
          ],
        },
        { name: "isPromoted", label: "Promoted (ranks higher in upsell suggestions)", type: "checkbox" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      createAction={createProduct}
      updateAction={updateProduct}
      deleteAction={deleteProduct}
      detailLink={{ hrefBase: "/admin/products", label: "Variants" }}
    />
  );
}
