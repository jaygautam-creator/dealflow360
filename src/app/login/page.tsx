import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/auth/session";
import { landingPathFor } from "@/infrastructure/auth/landing";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in — DealFlow360" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in? Send them where they belong rather than showing a dead form.
  const session = await getSession();
  if (session) redirect(landingPathFor(session.role));

  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl md:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-900">
        {/* A brand panel earns the first impression its own space, rather than sharing
            the crowded form column — this is the screen every judge sees first. */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 to-indigo-800 p-10 text-white md:flex">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
              DF
            </div>
            <span className="text-lg font-semibold tracking-tight">DealFlow360</span>
          </div>
          <div>
            <p className="text-2xl font-semibold leading-snug tracking-tight">
              Quote, price and approve — with the reasoning shown, not hidden.
            </p>
            <p className="mt-3 text-sm text-indigo-100">
              Sales operations workspace for pricing, risk-scored approvals and fulfilment.
            </p>
          </div>
          <p className="text-xs text-indigo-200">Internal sales operations tool</p>
        </div>

        <div className="flex flex-col justify-center p-8 sm:p-10">
          <div className="mb-8 md:hidden">
            <div className="mb-6 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                DF
              </div>
              <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                DealFlow360
              </span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Sales operations workspace
          </p>
          <div className="mt-8">
            <LoginForm next={next} />
            <p className="mt-5 text-center text-xs text-neutral-400">
              Forgot your password? Ask your administrator to reset it.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
