"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not process that request.");
        return;
      }
      setSent(data.message);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{sent}</p>
        <p className="rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-500 dark:bg-neutral-800/60">
          This system runs locally and has no mail service, so the link is written to the
          server console — the terminal running <code className="font-mono">npm run dev</code>.
          That console is the only place it appears; it is deliberately never shown here,
          because a page that displayed it would let anyone reset any account.
        </p>
        <Link href="/login" className="inline-block text-sm font-medium text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        name="email"
        type="email"
        label="Email address"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint="We'll issue a single-use link that expires in 30 minutes."
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" loading={busy} className="w-full">
        Send reset link
      </Button>
      <Link href="/login" className="inline-block text-sm font-medium text-indigo-600 hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
