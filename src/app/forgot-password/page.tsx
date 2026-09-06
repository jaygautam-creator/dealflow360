import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/auth/session";
import { landingPathFor } from "@/infrastructure/auth/landing";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // Someone already signed in does not need this screen.
  const session = await getSession();
  if (session) redirect(landingPathFor(session.role));

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
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Reset your password
        </h1>
        <p className="mb-6 mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Enter the address on your account and we&apos;ll issue a reset link.
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
