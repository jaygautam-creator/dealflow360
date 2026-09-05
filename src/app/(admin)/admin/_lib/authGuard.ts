import "server-only";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { can, canAny, PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { AuthError } from "@/infrastructure/auth/session";

/**
 * Server Action guards for the admin config screens.
 *
 * Server Actions are callable directly (not just through the page that renders their
 * form), so the page-level `requirePermissionPage` in the route layout is not enough on
 * its own — a write must check permission again at the point of mutation. These return an
 * `{ error }` value shaped like every other action result instead of throwing, since
 * EntityManager's `handleSubmit` already knows how to surface that in the form.
 */

type GuardResult = { error: string } | undefined;

async function checkPermission(allowed: (role: Parameters<typeof can>[0]) => boolean): Promise<GuardResult> {
  try {
    const user = await requireUserApi();
    if (!allowed(user.role)) {
      return { error: "You do not have permission to make this change." };
    }
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    throw error;
  }
}

/** Products, categories, price lists, warehouses, subscription plans, upsell rules. */
export function guardConfigManage(): Promise<GuardResult> {
  return checkPermission((role) => can(role, P.CONFIG_MANAGE));
}

/** Approval rules, tier ceilings, and risk config: a sales manager owns these without full CONFIG_MANAGE. */
export function guardConfigWrite(): Promise<GuardResult> {
  return checkPermission((role) => canAny(role, [P.CONFIG_MANAGE, P.CONFIG_APPROVAL_CHAIN]));
}

/** Month-end promotions: a sales manager owns this lever alongside tier ceilings. */
export function guardPromotionWrite(): Promise<GuardResult> {
  return checkPermission((role) => canAny(role, [P.CONFIG_MANAGE, P.CONFIG_PROMOTION]));
}
