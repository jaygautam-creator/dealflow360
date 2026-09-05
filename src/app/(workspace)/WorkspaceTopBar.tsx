"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Top-bar actions for the internal workspace. Kept as its own component rendered by the
 * workspace layout, rather than folded into AppShell, since AppShell is owned by another
 * session redesigning it right now.
 */
export function WorkspaceTopBar({ showBackend }: { showBackend: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loggingOut, setLoggingOut] = useState(false);

  function reload() {
    // Every workspace page is `force-dynamic`, so router.refresh() is a real re-fetch of
    // pricing/stock/approval data from the server — not a client-side cache trick.
    startTransition(() => router.refresh());
  }

  async function closeWorkspace() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 md:px-8">
      {/* A plain GET form rather than client-side filtering: the result is a real,
          linkable, shareable URL, and the search runs against the caller's own scoped
          query on the server instead of over whatever rows the client happens to hold. */}
      <form action="/workspace/quotations" className="relative min-w-0 flex-1 max-w-sm">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="search"
          name="q"
          placeholder="Search customer or quotation number…"
          aria-label="Search quotations"
          className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </form>
      <div className="ml-auto flex items-center gap-1">
      <Button variant="ghost" size="sm" loading={pending} leftIcon={<RefreshCw className="size-4" />} onClick={reload}>
        Reload Data
      </Button>
      {showBackend ? (
        <Button variant="ghost" size="sm" leftIcon={<ExternalLink className="size-4" />} onClick={() => router.push("/admin")}>
          Go to Back-end
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" loading={loggingOut} leftIcon={<LogOut className="size-4" />} onClick={closeWorkspace}>
        Close Workspace
      </Button>
      </div>
    </div>
  );
}
