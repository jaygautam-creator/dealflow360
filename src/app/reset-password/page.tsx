import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

/**
 * The token arrives as a query parameter and is handed straight to the form.
 *
 * It is deliberately NOT validated here. Checking it on render would tell anyone holding a
 * guessed string whether it was real before they had to submit anything, and would leak
 * that answer through a page load rather than a rate-limitable POST. The single place a
 * token is judged is the route that spends it.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            DF
          </div>
          <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            DealFlow360
          </span>
        </div>

        {token ? (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Set a new password
            </h1>
            <p className="mb-6 mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              This link works once and expires 30 minutes after it was issued.
            </p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              This link is incomplete
            </h1>
            <p className="mb-6 mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              The address is missing its reset token. Request a fresh link and use the whole
              URL exactly as it was issued.
            </p>
            <Link href="/forgot-password">
              <Button>Request a new link</Button>
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
