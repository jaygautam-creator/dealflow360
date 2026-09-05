"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useState } from "react";
import type { ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "../ui/cn";

export interface NavItem {
  label: string;
  href: string;
  icon?: ReactNode;
  active?: boolean;
}

export interface AppShellUser {
  name: string;
  role?: string;
  avatarUrl?: string;
}

export interface AppShellProps {
  navItems: NavItem[];
  currentUser?: AppShellUser;
  children: ReactNode;
  brand?: ReactNode;
}

export function AppShell({ navItems, currentUser, children, brand }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const sidebarContent = (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {brand ?? "DealFlow360"}
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          // Longest-prefix match, so /workspace/quotations/abc highlights "Quotations"
          // while the "/workspace" root item does not also light up on every page.
          const isActive =
            item.active ??
            (pathname === item.href ||
              (item.href !== "/" &&
                pathname.startsWith(`${item.href}/`) &&
                !navItems.some(
                  (other) =>
                    other.href.length > item.href.length &&
                    (pathname === other.href || pathname.startsWith(`${other.href}/`)),
                )));

          return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              )}
              onClick={() => setDrawerOpen(false)}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
          );
        })}
      </ul>
      {currentUser && (
        <div className="flex items-center gap-3 border-t border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {currentUser.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {currentUser.name}
            </p>
            {currentUser.role && (
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {currentUser.role}
              </p>
            )}
          </div>
        </div>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="hidden w-64 shrink-0 border-r border-neutral-200 bg-white md:block dark:border-neutral-800 dark:bg-neutral-900">
        {sidebarContent}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-50 h-full w-64 bg-white shadow-xl dark:bg-neutral-900">
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-4 border-b border-neutral-200 bg-white px-4 md:hidden dark:border-neutral-800 dark:bg-neutral-900">
          <button
            type="button"
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
            className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {drawerOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
          <span className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {brand ?? "DealFlow360"}
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
