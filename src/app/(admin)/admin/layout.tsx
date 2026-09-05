import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { redirect } from "next/navigation";
import { AdminTopBar } from "../AdminTopBar";

/**
 * Admin route group guard.
 *
 * Access here is not a single yes/no. A Sales Manager owns discount governance — the
 * approval chain and the tier ceilings — but has no business editing the product
 * catalogue or warehouse stock. So the layout admits anyone holding *either* config
 * permission, and the navigation is filtered per permission so nobody is shown a screen
 * they cannot use.
 *
 * Individual pages still check for themselves. Filtering a nav item hides a link; it does
 * not protect the route behind it, and a URL typed directly must fail the same way.
 */

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", permission: null },
  { label: "Approval Rules", href: "/admin/approval-rules", permission: P.CONFIG_APPROVAL_CHAIN },
  { label: "Tier Ceilings", href: "/admin/tier-ceilings", permission: P.CONFIG_APPROVAL_CHAIN },
  { label: "Risk Config", href: "/admin/risk-config", permission: P.CONFIG_APPROVAL_CHAIN },
  { label: "Customers", href: "/admin/customers", permission: P.CONFIG_MANAGE },
  { label: "Products", href: "/admin/products", permission: P.CONFIG_MANAGE },
  { label: "Categories", href: "/admin/categories", permission: P.CONFIG_MANAGE },
  { label: "Price Lists", href: "/admin/price-lists", permission: P.CONFIG_MANAGE },
  { label: "Warehouses", href: "/admin/warehouses", permission: P.CONFIG_MANAGE },
  { label: "Subscription Plans", href: "/admin/subscription-plans", permission: P.CONFIG_MANAGE },
  { label: "Upsell Rules", href: "/admin/upsell-rules", permission: P.CONFIG_MANAGE },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUserPage("/admin");

  const mayConfigure = can(user.role, P.CONFIG_MANAGE);
  const mayTuneGovernance = can(user.role, P.CONFIG_APPROVAL_CHAIN);

  if (!mayConfigure && !mayTuneGovernance) {
    // Send them somewhere they belong rather than to a dead end.
    redirect(user.role === "PORTAL" ? "/portal" : "/workspace");
  }

  const navItems = NAV_ITEMS.filter(
    (item) => item.permission === null || can(user.role, item.permission),
  ).map(({ label, href }) => ({ label, href }));

  return (
    <AppShell
      navItems={navItems}
      brand="DealFlow360 Admin"
      currentUser={{ name: user.name, role: formatRole(user.role) }}
    >
      <AdminTopBar />
      {children}
    </AppShell>
  );
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}
