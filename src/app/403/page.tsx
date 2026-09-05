import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { getSession } from "@/infrastructure/auth/session";
import { landingPathFor } from "@/infrastructure/auth/landing";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Not permitted" };
export const dynamic = "force-dynamic";

/**
 * WHY THIS PAGE EXISTS:
 * `requirePermissionPage` has always redirected an authorised-but-not-permitted user to
 * `/403`. That route did not exist, so the redirect produced a 404 — the framework's
 * "this page is not here", which is exactly the wrong thing to tell someone. The page is
 * there; they may not open it. A Finance user reaching /workspace/quotations/new saw
 * "404" and reasonably concluded the feature was broken rather than closed to them.
 *
 * The page names the permission boundary out loud instead of hiding behind a status code:
 * who you are signed in as, and where you may go instead.
 */
export default async function ForbiddenPage() {
  const session = await getSession();
  const home = session ? landingPathFor(session.role) : "/login";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950">
          <ShieldOff className="size-6" />
        </div>

        <h1 className="mt-5 text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          You don&apos;t have access to this
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {session ? (
            <>
              This page exists, but your role{" "}
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                ({session.role.replace(/_/g, " ").toLowerCase()})
              </span>{" "}
              doesn&apos;t carry the permission it requires. That is a deliberate boundary,
              not a fault.
            </>
          ) : (
            <>Your session has ended. Sign in again to continue.</>
          )}
        </p>

        <div className="mt-6">
          <Link href={home}>
            <Button>{session ? "Back to your workspace" : "Sign in"}</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
