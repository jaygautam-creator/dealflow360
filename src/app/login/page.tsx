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
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-6 py-12 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              DF
            </div>
            <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              DealFlow360
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Sales operations workspace
          </p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
