import { dbToPct } from "@/infrastructure/money";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createCategory, deleteCategory, updateCategory } from "./actions";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
  });

  const rows = categories.map((c) => ({
    id: c.id,
    name: c.name,
    maxDiscountPct: String(dbToPct(c.maxDiscountPct)),
  }));

  return (
    <EntityManager
      title="Categories"
      subtitle="Category-level discount ceilings. Thin-margin categories sit below a customer's tier ceiling — the stricter one wins on every quotation."
      emptyLabel="No categories yet"
      rows={rows}
      columns={[
        { key: "name", header: "Name" },
        { key: "maxDiscountPct", header: "Max discount", kind: "percent" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        {
          name: "maxDiscountPct",
          label: "Max discount %",
          type: "number",
          step: "0.01",
          required: true,
          hint: "Whole percentage, e.g. 15 for 15%",
        },
      ]}
      createAction={createCategory}
      updateAction={updateCategory}
      deleteAction={deleteCategory}
    />
  );
}
