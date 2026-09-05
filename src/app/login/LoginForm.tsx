"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/** The five seeded personas, offered as one-click fills so a reviewer can switch roles fast. */
const DEMO_ACCOUNTS = [
  { email: "rep@dealflow.test", label: "Sales Rep", detail: "Builds quotations" },
  { email: "manager@dealflow.test", label: "Sales Manager", detail: "First-level approvals" },
  { email: "finance@dealflow.test", label: "Finance", detail: "Second-level approvals" },
  { email: "admin@dealflow.test", label: "Admin", detail: "Governance configuration" },
  { email: "buyer@acme.test", label: "Customer Portal", detail: "Acme Corp only" },
] as const;

const DEMO_PASSWORD = "demo1234";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("rep@dealflow.test");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }
      // Refresh so Server Components re-read the new session cookie.
      router.push(next || data.redirectTo);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is it running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
          Create an account
        </Link>
      </p>

      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Demo accounts
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Every account uses the password <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">{DEMO_PASSWORD}</code>
        </p>
        <ul className="mt-3 space-y-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                }}
                className="flex w-full items-baseline justify-between rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{a.label}</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{a.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
