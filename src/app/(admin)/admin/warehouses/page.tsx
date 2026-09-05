import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createWarehouse, deleteWarehouse, updateWarehouse } from "./actions";

export default async function WarehousesPage() {
  const warehouses = await prisma.warehouse.findMany({ orderBy: { code: "asc" } });

  const rows = warehouses.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    shippingCostWeight: w.shippingCostWeight.toString(),
    isActive: w.isActive,
  }));

  return (
    <EntityManager
      title="Warehouses"
      subtitle="Fulfilment sources. Shipping cost weight breaks ties when the planner can cover demand from more than one warehouse."
      emptyLabel="No warehouses yet"
      rows={rows}
      columns={[
        { key: "code", header: "Code" },
        { key: "name", header: "Name" },
        { key: "shippingCostWeight", header: "Shipping weight" },
        {
          key: "isActive",
          header: "Status",
          kind: "badge",
          toneMap: { true: "success", false: "neutral" },
          labelMap: { true: "Active", false: "Inactive" },
        },
      ]}
      fields={[
        { name: "code", label: "Code", type: "text", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        {
          name: "shippingCostWeight",
          label: "Shipping cost weight",
          type: "number",
          step: "0.01",
          required: true,
        },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      createAction={createWarehouse}
      updateAction={updateWarehouse}
      deleteAction={deleteWarehouse}
      detailLink={{ hrefBase: "/admin/warehouses", label: "Stock levels" }}
    />
  );
}
