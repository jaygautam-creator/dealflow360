import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/infrastructure/auth/token";
import { can, type Permission, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { landingPathFor } from "@/infrastructure/auth/landing";

/**
 * Request-pipeline authorisation.
 *
 * Route groups solve layout, not access. Every admin page sits under one layout, but they
 * do not all require the same permission: a Sales Manager owns discount governance while
 * the product catalogue belongs to an administrator. Filtering the navigation hides the
 * link and nothing more — typing the URL still reaches the page.
 *
 * So path-to-permission is declared here, once, and enforced before the route renders.
 * A page added later is covered by the prefix rule without anyone remembering to guard it,
 * which is the failure mode this replaces.
 *
 * This is defence in depth rather than the only line: the API routes each re-check their
 * own permission, because a request that never passes through here must still be refused.
 */

/** Longest prefix wins, so the list is ordered most-specific first. */
const PROTECTED: { prefix: string; permission: Permission }[] = [
  { prefix: "/admin/approval-rules", permission: P.CONFIG_APPROVAL_CHAIN },
  { prefix: "/admin/tier-ceilings", permission: P.CONFIG_APPROVAL_CHAIN },
  { prefix: "/admin/risk-config", permission: P.CONFIG_APPROVAL_CHAIN },
  { prefix: "/admin/month-end-offers", permission: P.CONFIG_PROMOTION },
  { prefix: "/admin/customers", permission: P.CONFIG_MANAGE },
  { prefix: "/admin/products", permission: P.CONFIG_MANAGE },
  { prefix: "/admin/categories", permission: P.CONFIG_MANAGE },
  { prefix: "/admin/price-lists", permission: P.CONFIG_MANAGE },
  { prefix: "/admin/warehouses", permission: P.CONFIG_MANAGE },
  { prefix: "/admin/subscription-plans", permission: P.CONFIG_MANAGE },
  { prefix: "/admin/upsell-rules", permission: P.CONFIG_MANAGE },
  { prefix: "/portal", permission: P.PORTAL_VIEW },
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rule = PROTECTED.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const claims = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!claims) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (!can(claims.role, rule.permission)) {
    // Redirect to the principal's own home rather than a 403 page: being shown a door you
    // may not open is less useful than being put where you belong.
    return NextResponse.redirect(new URL(landingPathFor(claims.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
