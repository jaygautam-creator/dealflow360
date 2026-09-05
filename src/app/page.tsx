import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/auth/session";
import { landingPathFor } from "@/infrastructure/auth/landing";

/**
 * The root is a router, not a page. Each role has exactly one home, and sending a
 * principal straight there avoids ever rendering a surface they cannot use.
 */
export default async function RootPage() {
  const session = await getSession();
  redirect(session ? landingPathFor(session.role) : "/login");
}
