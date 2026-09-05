import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/infrastructure/db";
import { PortalUserPanel } from "./PortalUserPanel";
import { createPortalUser, resetPortalUserPassword } from "./actions";

export const metadata = { title: "Customer" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Auth is enforced at two outer layers: proxy.ts (longest-prefix match on
  // /admin/customers) and the admin layout (guards the entire /admin group). This page
  // does not re-check — that matches the pattern of the products and warehouses detail
  // pages, which also rely on the same outer guards.
  const { id } = await params;

  const [customer, portalUsers] = await Promise.all([
    prisma.customer.findUnique({ where: { id } }),
    prisma.user.findMany({
      where: { customerId: id, role: "PORTAL" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, isActive: true, createdAt: true },
    }),
  ]);

  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="size-4" />
        All customers
      </Link>

      <PageHeader
        title={customer.name}
        subtitle={`${customer.tier} tier · ${customer.email}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-neutral-500">Tier</dt>
              <dd className="mt-0.5">
                <Badge
                  tone={
                    customer.tier === "GOLD"
                      ? "warning"
                      : customer.tier === "SILVER"
                        ? "info"
                        : "neutral"
                  }
                >
                  {customer.tier}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Email</dt>
              <dd className="mt-0.5 font-medium">{customer.email}</dd>
            </div>
            {customer.city ? (
              <div>
                <dt className="text-neutral-500">City</dt>
                <dd className="mt-0.5">{customer.city}</dd>
              </div>
            ) : null}
            {customer.country ? (
              <div>
                <dt className="text-neutral-500">Country</dt>
                <dd className="mt-0.5">{customer.country}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* Server actions are passed as props to the client component — the same pattern
          EntityManager uses for createAction / updateAction / deleteAction. */}
      <PortalUserPanel
        customerId={id}
        users={portalUsers.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        }))}
        createAction={createPortalUser}
        resetPasswordAction={resetPortalUserPassword}
      />
    </div>
  );
}
