"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="text-sm text-neutral-500 underline-offset-4 transition hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
    >
      Sign out
    </button>
  );
}
