import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../../_components/EntityManager";
import { createVariant, deleteVariant, updateVariant } from "./actions";

export const metadata = { title: "Product" };

export default async function ProductVariantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!product) notFound();

  const rows = product.variants.map((v) => ({
    id: v.id,
    attribute: v.attribute,
    value: v.value,
    extraPrice: v.extraPrice.toString(),
  }));

  return (
    <div>
      <Link
        href="/admin/products"
        className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="size-4" /> Products
      </Link>
      <PageHeader
        title={`Variants — ${product.name}`}
        subtitle={`SKU ${product.sku}. A quotation line may pin a variant; its extra price adds to the product's list price.`}
      />
      <EntityManager
        title="Variants"
        emptyLabel="No variants for this product"
        rows={rows}
        columns={[
          { key: "attribute", header: "Attribute" },
          { key: "value", header: "Value" },
          { key: "extraPrice", header: "Extra price" },
        ]}
        fields={[
          {
            name: "attribute",
            label: "Attribute",
            type: "text",
            required: true,
            placeholder: "e.g. Size",
          },
          {
            name: "value",
            label: "Value",
            type: "text",
            required: true,
            placeholder: "e.g. Large",
          },
          { name: "extraPrice", label: "Extra price", type: "number", step: "0.01" },
        ]}
        createAction={createVariant.bind(null, id)}
        updateAction={updateVariant}
        deleteAction={deleteVariant}
      />
    </div>
  );
}
