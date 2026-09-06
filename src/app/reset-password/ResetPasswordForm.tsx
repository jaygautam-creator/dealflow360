"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PASSWORD_MIN_LENGTH } from "@/domain/auth/passwordReset";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmation }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not reset the password.");
        return;
      }
      setDone(true);
      // Deliberately not signed in automatically: proving you can read the link is not the
      // same as proving you know the new password, and the next screen should confirm it.
      setTimeout(() => router.push("/login"), 1500);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Password changed. The link you used has been retired.
        </p>
        <p className="text-sm text-neutral-500">Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      />
      <Input
        name="confirmation"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" loading={busy} className="w-full">
        Set new password
      </Button>
      <Link href="/forgot-password" className="inline-block text-sm font-medium text-indigo-600 hover:underline">
        Request a new link
      </Link>
    </form>
  );
}
