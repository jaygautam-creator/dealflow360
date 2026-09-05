import { LayoutDashboard, FileText, CheckSquare, Activity, Settings, Package, Receipt, Repeat, BarChart3 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { can, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { redirect } from "next/navigation";
import { WorkspaceTopBar } from "./WorkspaceTopBar";

/**
 * Internal workspace shell.
 *
 * Navigation is derived from the signed-in role's permissions rather than hardcoded per
 * role. A link the user cannot use is never rendered — but the pages behind each link
 * still guard themselves, because hiding a link is presentation, not access control.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage("/workspace");

  // A portal user must never see the internal shell, even for a moment.
  if (user.role === "PORTAL") redirect("/portal");

  const navItems = [
    { label: "Pipeline", href: "/workspace", icon: <LayoutDashboard className="size-4" />, show: true },
    { label: "Quotations", href: "/workspace/quotations", icon: <FileText className="size-4" />, show: true },
    {
      label: "Approvals",
      href: "/workspace/approvals",
      icon: <CheckSquare className="size-4" />,
      show: can(user.role, P.APPROVE_AS_MANAGER) || can(user.role, P.APPROVE_AS_FINANCE),
    },
    {
      label: "Deal Health",
      href: "/workspace/health",
      icon: <Activity className="size-4" />,
      show: can(user.role, P.DASHBOARD_VIEW),
    },
    {
      label: "Orders",
      href: "/workspace/orders",
      icon: <Package className="size-4" />,
      show: can(user.role, P.FULFILLMENT_VIEW),
    },
    {
      label: "Reports",
      href: "/workspace/reports",
      icon: <BarChart3 className="size-4" />,
      show: can(user.role, P.DASHBOARD_VIEW),
    },
    {
      label: "Invoices",
      href: "/workspace/orders/invoices",
      icon: <Receipt className="size-4" />,
      show: can(user.role, P.BILLING_MANAGE),
    },
    {
      label: "Subscriptions",
      href: "/workspace/orders/subscriptions",
      icon: <Repeat className="size-4" />,
      show: can(user.role, P.FULFILLMENT_VIEW),
    },
    {
      label: "Configuration",
      href: "/admin",
      icon: <Settings className="size-4" />,
      show: can(user.role, P.CONFIG_MANAGE) || can(user.role, P.CONFIG_APPROVAL_CHAIN),
    },
  ]
    .filter((i) => i.show)
    .map(({ label, href, icon }) => ({ label, href, icon }));

  return (
    <AppShell
      brand="DealFlow360"
      navItems={navItems}
      currentUser={{ name: user.name, role: formatRole(user.role) }}
    >
      <WorkspaceTopBar showBackend={can(user.role, P.CONFIG_MANAGE) || can(user.role, P.CONFIG_APPROVAL_CHAIN)} />
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
