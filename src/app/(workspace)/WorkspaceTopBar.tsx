"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ExternalLink, LogOut } from "lucide-react";
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
    <div className="flex items-center justify-end gap-2 border-b border-neutral-200 bg-white px-4 py-2 md:px-8 dark:border-neutral-800 dark:bg-neutral-900">
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
  );
}
