"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Top-bar actions for the admin area. AppShell renders navigation only — every route
 * group is responsible for its own sign-out affordance (see WorkspaceTopBar, and the
 * portal layout's LogoutButton). This was the missing one.
 */
export function AdminTopBar() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function signOut() {
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
      <Button variant="ghost" size="sm" leftIcon={<ExternalLink className="size-4" />} onClick={() => router.push("/workspace")}>
        Back to Workspace
      </Button>
      <Button variant="ghost" size="sm" loading={loggingOut} leftIcon={<LogOut className="size-4" />} onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
