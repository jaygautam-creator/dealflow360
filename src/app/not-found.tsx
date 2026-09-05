import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { getSession } from "@/infrastructure/auth/session";
import { landingPathFor } from "@/infrastructure/auth/landing";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Not found" };
export const dynamic = "force-dynamic";

/**
 * WHY THIS PAGE EXISTS:
 * Seven pages call `notFound()` and there was no not-found boundary, so every one of them
 * fell through to Next's built-in black-on-white "404: This page could not be found".
 *
 * That is worse here than it looks. `getQuotation` applies the caller's tenancy scope, so
 * a quotation belonging to another rep is *not found* rather than *forbidden* — that is
 * the deliberate design, because "forbidden" would confirm the record exists. But the
 * unstyled fallback made a correctly-working tenancy filter look like the application had
 * crashed. Same failure as the missing /403: a boundary reading as a broken feature.
 *
 * Deliberately does NOT distinguish "no such record" from "not yours". Saying which would
 * hand an attacker an existence oracle for other tenants' data.
 */
export default async function NotFound() {
  const session = await getSession();
  const home = session ? landingPathFor(session.role) : "/login";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
          <FileQuestion className="size-6" />
        </div>

        <h1 className="mt-5 text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          We couldn&apos;t find that
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          The page or record you asked for doesn&apos;t exist, or isn&apos;t one your
          account can see. If you followed a link from somewhere, it may be out of date.
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
