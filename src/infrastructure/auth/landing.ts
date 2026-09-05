import type { Role } from "@/generated/prisma";

/**
 * Where each role belongs after signing in.
 *
 * Kept in one place so the login route, the root redirect and the unauthorised-page
 * fallback all agree. A portal user must never land on an internal surface, even briefly.
 */
export function landingPathFor(role: Role): string {
  switch (role) {
    case "PORTAL":
      return "/portal";
    case "ADMIN":
      return "/admin";
    case "FINANCE":
    case "SALES_MANAGER":
    case "SALES_REP":
      return "/workspace";
  }
}
