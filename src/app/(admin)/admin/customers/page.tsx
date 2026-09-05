import { CustomerTier } from "@/generated/prisma";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createCustomer, deleteCustomer, updateCustomer } from "./actions";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });

  const rows = customers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    tier: c.tier,
    city: c.city ?? "",
    country: c.country ?? "",
  }));

  return (
    <EntityManager
      title="Customers"
      subtitle="Customer accounts. Tier drives which price list applies and sets the discount ceiling that feeds blended risk scoring. Open a row to manage that customer's portal logins."
      emptyLabel="No customers yet — create one to start quoting"
      rows={rows}
      columns={[
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        {
          key: "tier",
          header: "Tier",
          kind: "badge",
          toneMap: { GOLD: "warning", SILVER: "info", BRONZE: "neutral" },
        },
        { key: "city", header: "City" },
        { key: "country", header: "Country" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "email", label: "Email address", type: "text", required: true },
        {
          name: "tier",
          label: "Tier",
          type: "select",
          required: true,
          options: Object.values(CustomerTier).map((v) => ({ value: v, label: v })),
        },
        { name: "city", label: "City (optional)", type: "text" },
        { name: "country", label: "Country (optional)", type: "text" },
      ]}
      createAction={createCustomer}
      updateAction={updateCustomer}
      deleteAction={deleteCustomer}
      detailLink={{ hrefBase: "/admin/customers", label: "Portal users" }}
    />
  );
}
