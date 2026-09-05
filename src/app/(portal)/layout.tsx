import Link from "next/link";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { redirect } from "next/navigation";
import { LogoutButton } from "./LogoutButton";

/**
 * Customer portal shell.
 *
 * Deliberately not the internal AppShell. The portal has no sidebar, no internal
 * navigation and no company branding beyond the supplier's name — it is the customer's
 * view of their own documents, and it should not look or behave like an employee tool.
 * Sharing the internal shell here is how internal links start leaking into a customer's
 * browser.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage("/portal");

  // Internal staff have no business in the customer portal either — the boundary runs
  // both ways, so a rep cannot "just take a look" at the customer's view of a deal.
  if (user.role !== "PORTAL") redirect("/workspace");

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/portal" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
              DF
            </div>
            <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              DealFlow360
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">{user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
