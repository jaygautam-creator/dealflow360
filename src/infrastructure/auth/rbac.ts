import type { Role } from "@/generated/prisma";

/**
 * Role-based access control.
 *
 * Permissions are declared as a matrix rather than scattered through the codebase as
 * `if (user.role === "MANAGER")` checks. Two things follow from that: adding a role is a
 * data change in one file instead of a hunt through every route, and the complete policy
 * can be read — and audited — in one screen.
 *
 * Ownership scoping is deliberately separate from permission. "May read quotations" and
 * "may read *whose* quotations" are different questions; conflating them is how tenancy
 * bugs happen. A rep holds QUOTATION_READ_OWN, a manager holds QUOTATION_READ_ALL, and a
 * portal user holds neither — they get PORTAL_VIEW, which is scoped by customerId.
 */

export const PERMISSIONS = {
  QUOTATION_CREATE: "quotation:create",
  QUOTATION_READ_OWN: "quotation:read:own",
  QUOTATION_READ_ALL: "quotation:read:all",
  QUOTATION_UPDATE: "quotation:update",
  QUOTATION_CONFIRM: "quotation:confirm",
  APPROVE_AS_MANAGER: "approval:manager",
  APPROVE_AS_FINANCE: "approval:finance",
  FULFILLMENT_VIEW: "fulfillment:view",
  FULFILLMENT_OVERRIDE: "fulfillment:override",
  BILLING_MANAGE: "billing:manage",
  CONFIG_MANAGE: "config:manage",
  CONFIG_APPROVAL_CHAIN: "config:approval-chain",
  DASHBOARD_VIEW: "dashboard:view",
  PORTAL_VIEW: "portal:view",
  USER_MANAGE: "user:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/**
 * The complete policy. Every role's capabilities are visible here and nowhere else.
 *
 * Note that PORTAL is intentionally almost empty. A customer-facing user is not a
 * restricted internal user — they are a different kind of principal entirely, and giving
 * them a cut-down version of an internal role is how portal users end up seeing costs,
 * margins or other customers' deals.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: Object.values(P),

  SALES_REP: [
    P.QUOTATION_CREATE,
    P.QUOTATION_READ_OWN,
    P.QUOTATION_UPDATE,
    P.QUOTATION_CONFIRM,
    P.FULFILLMENT_VIEW,
    P.DASHBOARD_VIEW,
  ],

  SALES_MANAGER: [
    P.QUOTATION_CREATE,
    P.QUOTATION_READ_OWN,
    P.QUOTATION_READ_ALL,
    P.QUOTATION_UPDATE,
    P.QUOTATION_CONFIRM,
    P.APPROVE_AS_MANAGER,
    P.FULFILLMENT_VIEW,
    P.DASHBOARD_VIEW,
    // A manager configures discount tiers and approval chains, but not the whole system.
    P.CONFIG_APPROVAL_CHAIN,
  ],

  FINANCE: [
    P.QUOTATION_READ_ALL,
    P.APPROVE_AS_FINANCE,
    P.FULFILLMENT_VIEW,
    P.FULFILLMENT_OVERRIDE,
    P.BILLING_MANAGE,
    P.DASHBOARD_VIEW,
  ],

  PORTAL: [P.PORTAL_VIEW],
};

/** Does this role hold this permission? The single question every guard asks. */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** True when the role holds every listed permission. */
export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/** True when the role holds at least one of the listed permissions. */
export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Everything a role can do. Used to render navigation without hardcoding it per role. */
export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * Resolves the quotation filter a principal is allowed to see.
 *
 * Returning a *filter* rather than a boolean means the scoping cannot be forgotten at the
 * call site — a caller has to apply the returned constraint to get any rows at all.
 */
export function quotationScopeFor(
  role: Role,
  userId: string,
  customerId: string | null,
): { kind: "ALL" } | { kind: "OWN"; ownerId: string } | { kind: "CUSTOMER"; customerId: string } | { kind: "NONE" } {
  if (can(role, P.QUOTATION_READ_ALL)) return { kind: "ALL" };
  if (role === "PORTAL") {
    // A portal user with no customer link is a data error; deny rather than leak.
    return customerId ? { kind: "CUSTOMER", customerId } : { kind: "NONE" };
  }
  if (can(role, P.QUOTATION_READ_OWN)) return { kind: "OWN", ownerId: userId };
  return { kind: "NONE" };
}
