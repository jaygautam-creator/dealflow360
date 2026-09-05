import "server-only";
import { redirect } from "next/navigation";
import { AuthError, getSession, type SessionUser } from "./session";
import { can, canMutateQuotation, type Permission } from "./rbac";
import type { Role } from "@/generated/prisma";

/**
 * Guards used by Server Components and Route Handlers.
 *
 * Two flavours deliberately exist. Pages `redirect` — an unauthenticated human should land
 * on the login screen, not read a JSON error. API handlers `throw AuthError`, which the
 * route maps to a 401 or 403 status, because a fetch caller needs a status code, not HTML.
 *
 * Both funnel through the same permission check, so the two paths can never drift apart.
 */

/** For pages. Sends an unauthenticated visitor to the login screen. */
export async function requireUserPage(returnTo?: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return user;
}

/** For pages. Sends an authenticated but unauthorised visitor somewhere they may go. */
export async function requirePermissionPage(
  permission: Permission,
  returnTo?: string,
): Promise<SessionUser> {
  const user = await requireUserPage(returnTo);
  if (!can(user.role, permission)) {
    // A portal user who wanders into an internal URL belongs in the portal, not on a
    // 403 page — the redirect is the friendlier and equally safe outcome.
    redirect(user.role === "PORTAL" ? "/portal" : "/403");
  }
  return user;
}

/** For API route handlers. Throws rather than redirecting. */
export async function requireUserApi(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthError("Authentication required", 401);
  return user;
}

/** For API route handlers. */
export async function requirePermissionApi(permission: Permission): Promise<SessionUser> {
  const user = await requireUserApi();
  if (!can(user.role, permission)) {
    throw new AuthError(`Your role (${user.role}) may not perform ${permission}`, 403);
  }
  return user;
}

/**
 * Asserts that the actor has permission and ownership rights to mutate the quotation.
 * Throws AuthError (403) if unauthorized.
 */
export function assertCanMutateQuotation(
  actor: { id: string; role?: Role } | string,
  quotation: { ownerId: string },
): void {
  const actorObj = typeof actor === "string" ? { id: actor, role: undefined } : actor;
  if (actorObj.role) {
    if (!canMutateQuotation({ id: actorObj.id, role: actorObj.role }, quotation)) {
      throw new AuthError("You may only modify quotations you own.", 403);
    }
  } else {
    if (quotation.ownerId !== actorObj.id) {
      throw new AuthError("You may only modify quotations you own.", 403);
    }
  }
}

