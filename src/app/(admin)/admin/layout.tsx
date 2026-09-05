import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

// Nav "active" highlighting is intentionally left static (no usePathname) because this
// layout is a Server Component — keeping it server-rendered avoids a client boundary
// around every admin page for a cosmetic highlight. RBAC guards are wired centrally
// elsewhere; this route group assumes it is already protected.
const NAV_ITEMS = [
  { label: "Overview", href: "/admin" },
  { label: "Products", href: "/admin/products" },
  { label: "Categories", href: "/admin/categories" },
  { label: "Price Lists", href: "/admin/price-lists" },
  { label: "Tier Ceilings", href: "/admin/tier-ceilings" },
  { label: "Approval Rules", href: "/admin/approval-rules" },
  { label: "Risk Config", href: "/admin/risk-config" },
  { label: "Warehouses", href: "/admin/warehouses" },
  { label: "Subscription Plans", href: "/admin/subscription-plans" },
  { label: "Upsell Rules", href: "/admin/upsell-rules" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell navItems={NAV_ITEMS} brand="DealFlow360 Admin">
      {children}
    </AppShell>
  );
}
