"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * WHY THIS PAGE EXISTS:
 * Without an error boundary an unhandled server error renders Next's default screen,
 * which in production says only "Application error: a server-side exception has occurred"
 * — no way back, and nothing to quote to whoever has to fix it.
 *
 * The digest is shown deliberately. It is the id Next writes to the server log alongside
 * the real stack trace, so it is the one piece of information that makes a report
 * actionable. The message itself is never shown: in production it is deliberately scrubbed
 * by the framework, and echoing raw error text to a browser is how internal detail leaks.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server errors already reach the server log. This catches the client-side half, so a
    // failure that only happens after hydration is not invisible.
    console.error("Unhandled application error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950">
          <AlertTriangle className="size-6" />
        </div>

        <h1 className="mt-5 text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Something went wrong
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          The page failed to load. Nothing you were doing has been saved — every write in
          this system happens inside a transaction, so a failure leaves no half-finished
          record behind.
        </p>

        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-neutral-400">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="secondary" onClick={() => { window.location.href = "/"; }}>
            Start over
          </Button>
        </div>
      </div>
    </main>
  );
}
