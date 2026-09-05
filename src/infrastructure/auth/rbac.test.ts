import { describe, it, expect } from "vitest";
import { can, canAll, canAny, canMutateQuotation, permissionsFor, quotationScopeFor, PERMISSIONS as P } from "./rbac";

describe("RBAC — role capabilities", () => {
  it("gives an admin every permission", () => {
    expect(canAll("ADMIN", Object.values(P))).toBe(true);
  });

  it("lets a rep build and confirm quotations but never approve one", () => {
    expect(can("SALES_REP", P.QUOTATION_CREATE)).toBe(true);
    expect(can("SALES_REP", P.QUOTATION_CONFIRM)).toBe(true);
    expect(can("SALES_REP", P.APPROVE_AS_MANAGER)).toBe(false);
    expect(can("SALES_REP", P.APPROVE_AS_FINANCE)).toBe(false);
  });

  it("stops a rep from reading other reps' quotations", () => {
    expect(can("SALES_REP", P.QUOTATION_READ_OWN)).toBe(true);
    expect(can("SALES_REP", P.QUOTATION_READ_ALL)).toBe(false);
  });

  it("stops a rep from touching governance configuration", () => {
    expect(canAny("SALES_REP", [P.CONFIG_MANAGE, P.CONFIG_APPROVAL_CHAIN])).toBe(false);
  });

  it("lets a manager approve at their own level but not at finance level", () => {
    expect(can("SALES_MANAGER", P.APPROVE_AS_MANAGER)).toBe(true);
    expect(can("SALES_MANAGER", P.APPROVE_AS_FINANCE)).toBe(false);
  });

  it("lets a manager tune the approval chain but not the whole system", () => {
    expect(can("SALES_MANAGER", P.CONFIG_APPROVAL_CHAIN)).toBe(true);
    expect(can("SALES_MANAGER", P.CONFIG_MANAGE)).toBe(false);
    expect(can("SALES_MANAGER", P.USER_MANAGE)).toBe(false);
  });

  it("lets finance approve at their level, override fulfilment and manage billing", () => {
    expect(canAll("FINANCE", [P.APPROVE_AS_FINANCE, P.FULFILLMENT_OVERRIDE, P.BILLING_MANAGE])).toBe(true);
  });

  it("does not let finance create quotations", () => {
    expect(can("FINANCE", P.QUOTATION_CREATE)).toBe(false);
  });
});

describe("RBAC — the portal is a different kind of principal, not a restricted internal one", () => {
  it("gives a portal user exactly one permission", () => {
    expect(permissionsFor("PORTAL")).toEqual([P.PORTAL_VIEW]);
  });

  it("never lets a portal user reach internal surfaces", () => {
    const internal = [
      P.QUOTATION_READ_ALL,
      P.QUOTATION_READ_OWN,
      P.QUOTATION_CREATE,
      P.APPROVE_AS_MANAGER,
      P.APPROVE_AS_FINANCE,
      P.CONFIG_MANAGE,
      P.CONFIG_APPROVAL_CHAIN,
      P.DASHBOARD_VIEW,
      P.BILLING_MANAGE,
      P.FULFILLMENT_VIEW,
      P.USER_MANAGE,
    ];
    for (const permission of internal) {
      expect(can("PORTAL", permission)).toBe(false);
    }
  });
});

describe("RBAC — quotation scoping", () => {
  it("gives a manager an unscoped view", () => {
    expect(quotationScopeFor("SALES_MANAGER", "u1", null)).toEqual({ kind: "ALL" });
  });

  it("scopes a rep to the quotations they own", () => {
    expect(quotationScopeFor("SALES_REP", "u1", null)).toEqual({ kind: "OWN", ownerId: "u1" });
  });

  it("scopes a portal user to their own customer", () => {
    expect(quotationScopeFor("PORTAL", "u9", "cust1")).toEqual({ kind: "CUSTOMER", customerId: "cust1" });
  });

  it("denies a portal user with no customer link rather than leaking everything", () => {
    // A portal account without a customer is a data error. Failing closed matters here:
    // the alternative is an unscoped query returning every customer's deals.
    expect(quotationScopeFor("PORTAL", "u9", null)).toEqual({ kind: "NONE" });
  });

  it("returns a filter rather than a boolean, so scoping cannot be forgotten", () => {
    // A caller must apply the returned constraint to get rows at all — there is no
    // "true" that silently means "no WHERE clause".
    const scope = quotationScopeFor("SALES_REP", "u1", null);
    expect(scope).toHaveProperty("kind");
    expect(Object.keys(scope).length).toBeGreaterThan(1);
  });
});

describe("RBAC — quotation mutation ownership & authorization", () => {
  const repQuote = { ownerId: "rep-1" };
  const repUser = { id: "rep-1", role: "SALES_REP" as const };
  const otherRepUser = { id: "rep-2", role: "SALES_REP" as const };
  const managerUser = { id: "mgr-1", role: "SALES_MANAGER" as const };
  const adminUser = { id: "admin-1", role: "ADMIN" as const };
  const financeUser = { id: "fin-1", role: "FINANCE" as const };
  const portalUser = { id: "cust-1", role: "PORTAL" as const };

  it("permits a sales rep to mutate a quotation they own", () => {
    expect(canMutateQuotation(repUser, repQuote)).toBe(true);
  });

  it("denies a sales rep from mutating a quotation owned by another rep", () => {
    expect(canMutateQuotation(otherRepUser, repQuote)).toBe(false);
  });

  it("permits an elevated sales manager to mutate any quotation", () => {
    expect(canMutateQuotation(managerUser, repQuote)).toBe(true);
  });

  it("permits an admin to mutate any quotation", () => {
    expect(canMutateQuotation(adminUser, repQuote)).toBe(true);
  });

  it("denies finance from mutating quotations (no quotation update permission)", () => {
    expect(canMutateQuotation(financeUser, repQuote)).toBe(false);
  });

  it("denies portal users from mutating internal quotations", () => {
    expect(canMutateQuotation(portalUser, repQuote)).toBe(false);
  });
});
