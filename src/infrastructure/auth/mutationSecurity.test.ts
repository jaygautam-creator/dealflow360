import { describe, it, expect } from "vitest";
import { canMutateQuotation } from "./rbac";

describe("Quotation Mutation Ownership Security (BOLA / IDOR protection)", () => {
  const quoteOwnedByRep1 = { ownerId: "sales-rep-1" };
  const quoteOwnedByRep2 = { ownerId: "sales-rep-2" };

  const rep1 = { id: "sales-rep-1", role: "SALES_REP" as const };
  const _rep2 = { id: "sales-rep-2", role: "SALES_REP" as const };
  const manager = { id: "manager-1", role: "SALES_MANAGER" as const };
  const admin = { id: "admin-1", role: "ADMIN" as const };
  const finance = { id: "finance-1", role: "FINANCE" as const };
  const portalUser = { id: "portal-1", role: "PORTAL" as const };

  it("permits a sales rep to modify a quotation they own", () => {
    expect(canMutateQuotation(rep1, quoteOwnedByRep1)).toBe(true);
  });

  it("forbids a sales rep from modifying another sales rep's quotation (BOLA protection)", () => {
    expect(canMutateQuotation(rep1, quoteOwnedByRep2)).toBe(false);
  });

  it("permits a sales manager to modify quotations across representatives", () => {
    expect(canMutateQuotation(manager, quoteOwnedByRep1)).toBe(true);
    expect(canMutateQuotation(manager, quoteOwnedByRep2)).toBe(true);
  });

  it("permits an administrator to modify any quotation", () => {
    expect(canMutateQuotation(admin, quoteOwnedByRep1)).toBe(true);
    expect(canMutateQuotation(admin, quoteOwnedByRep2)).toBe(true);
  });

  it("forbids finance from modifying quotations (enforces role segregation)", () => {
    expect(canMutateQuotation(finance, quoteOwnedByRep1)).toBe(false);
  });

  it("forbids customer portal users from modifying internal quotations", () => {
    expect(canMutateQuotation(portalUser, quoteOwnedByRep1)).toBe(false);
  });
});

describe("Negotiation Line Validation & Cross-Quotation Isolation", () => {
  const quotationA = {
    id: "quotation-a",
    lines: [{ id: "line-a1" }, { id: "line-a2" }],
  };
  const _quotationB = {
    id: "quotation-b",
    lines: [{ id: "line-b1" }],
  };

  function validateNegotiationLine(
    targetQuotation: typeof quotationA,
    suppliedLineId: string | null | undefined,
  ): boolean {
    if (!suppliedLineId) return true; // Order-level negotiation is allowed
    return targetQuotation.lines.some((l) => l.id === suppliedLineId);
  }

  it("accepts an order-level negotiation message without lineId", () => {
    expect(validateNegotiationLine(quotationA, null)).toBe(true);
    expect(validateNegotiationLine(quotationA, undefined)).toBe(true);
  });

  it("accepts a line-level negotiation message when lineId belongs to the quotation", () => {
    expect(validateNegotiationLine(quotationA, "line-a1")).toBe(true);
    expect(validateNegotiationLine(quotationA, "line-a2")).toBe(true);
  });

  it("rejects a negotiation message referencing a line from a different quotation (cross-quotation attack)", () => {
    // line-b1 belongs to quotation-b, not quotation-a
    expect(validateNegotiationLine(quotationA, "line-b1")).toBe(false);
    expect(validateNegotiationLine(quotationA, "non-existent-line")).toBe(false);
  });
});

describe("Fulfillment Allocation Balancing & Demands", () => {
  interface Demand {
    lineId: string;
    quantity: number;
  }
  interface Allocation {
    lineId: string;
    warehouseId: string | null;
    quantity: number;
  }

  function validateAllocations(demands: Demand[], allocations: Allocation[]): { valid: boolean; error?: string } {
    if (allocations.length === 0) return { valid: false, error: "At least one allocation is required." };

    const demandMap = new Map(demands.map((d) => [d.lineId, d.quantity]));
    const assignedPerLine = new Map<string, number>();

    for (const a of allocations) {
      if (!demandMap.has(a.lineId)) {
        return { valid: false, error: `Line ${a.lineId} does not belong to order.` };
      }
      if (a.quantity <= 0) {
        return { valid: false, error: "Quantity must be greater than zero." };
      }
      assignedPerLine.set(a.lineId, (assignedPerLine.get(a.lineId) ?? 0) + a.quantity);
    }

    for (const [lineId, required] of demandMap.entries()) {
      const assigned = assignedPerLine.get(lineId) ?? 0;
      if (assigned !== required) {
        return { valid: false, error: `Line ${lineId} requires ${required} units but received ${assigned}.` };
      }
    }

    return { valid: true };
  }

  it("validates when all lines are fully covered across multiple warehouses", () => {
    const demands = [
      { lineId: "line-1", quantity: 10 },
      { lineId: "line-2", quantity: 5 },
    ];
    const allocations = [
      { lineId: "line-1", warehouseId: "wh-north", quantity: 6 },
      { lineId: "line-1", warehouseId: "wh-south", quantity: 4 },
      { lineId: "line-2", warehouseId: "wh-north", quantity: 5 },
    ];
    const result = validateAllocations(demands, allocations);
    expect(result.valid).toBe(true);
  });

  it("validates when partially fulfilled with backorder", () => {
    const demands = [{ lineId: "line-1", quantity: 10 }];
    const allocations = [
      { lineId: "line-1", warehouseId: "wh-north", quantity: 7 },
      { lineId: "line-1", warehouseId: null, quantity: 3 }, // backorder
    ];
    const result = validateAllocations(demands, allocations);
    expect(result.valid).toBe(true);
  });

  it("rejects when an allocation under-assigns line quantity", () => {
    const demands = [{ lineId: "line-1", quantity: 10 }];
    const allocations = [{ lineId: "line-1", warehouseId: "wh-north", quantity: 9 }];
    const result = validateAllocations(demands, allocations);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("requires 10 units but received 9");
  });

  it("rejects when an allocation over-assigns line quantity", () => {
    const demands = [{ lineId: "line-1", quantity: 10 }];
    const allocations = [{ lineId: "line-1", warehouseId: "wh-north", quantity: 11 }];
    const result = validateAllocations(demands, allocations);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("requires 10 units but received 11");
  });

  it("rejects allocations with invalid lineId", () => {
    const demands = [{ lineId: "line-1", quantity: 10 }];
    const allocations = [{ lineId: "foreign-line", warehouseId: "wh-north", quantity: 10 }];
    const result = validateAllocations(demands, allocations);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not belong to order");
  });

  it("rejects non-positive quantities", () => {
    const demands = [{ lineId: "line-1", quantity: 10 }];
    const allocations = [{ lineId: "line-1", warehouseId: "wh-north", quantity: 0 }];
    const result = validateAllocations(demands, allocations);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Quantity must be greater than zero");
  });
});

describe("Quotation Lifecycle & Customer Confirmation Governance", () => {
  function canSendToCustomer(status: string): boolean {
    return status === "APPROVED";
  }

  it("strictly forbids sending DRAFT quotations to customer", () => {
    expect(canSendToCustomer("DRAFT")).toBe(false);
  });

  it("forbids sending unapproved quotations in review stages", () => {
    expect(canSendToCustomer("PENDING_MANAGER")).toBe(false);
    expect(canSendToCustomer("PENDING_FINANCE")).toBe(false);
    expect(canSendToCustomer("UNDER_NEGOTIATION")).toBe(false);
  });

  it("permits sending only when quotation status is APPROVED", () => {
    expect(canSendToCustomer("APPROVED")).toBe(true);
  });

  function canCustomerConfirm(params: {
    quotationCustomerId: string;
    sessionCustomerId: string;
    status: string;
    hasOpenNegotiation: boolean;
    requiresApproval: boolean;
  }): { allowed: boolean; reason?: string } {
    if (params.quotationCustomerId !== params.sessionCustomerId) {
      return { allowed: false, reason: "Quotation belongs to a different customer" };
    }
    if (params.hasOpenNegotiation) {
      return { allowed: false, reason: "Negotiation is in progress" };
    }
    if (params.requiresApproval) {
      return { allowed: false, reason: "Requires manager or finance approval" };
    }
    const eligibleStatuses = ["SENT", "APPROVED", "UNDER_NEGOTIATION"];
    if (!eligibleStatuses.includes(params.status)) {
      return { allowed: false, reason: `Cannot confirm quotation in ${params.status} status` };
    }
    return { allowed: true };
  }

  it("forbids customer confirmation if quotation belongs to another customer (BOLA/IDOR)", () => {
    const res = canCustomerConfirm({
      quotationCustomerId: "cust-1",
      sessionCustomerId: "cust-2",
      status: "SENT",
      hasOpenNegotiation: false,
      requiresApproval: false,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("different customer");
  });

  it("forbids customer confirmation if draft or unapproved", () => {
    const res = canCustomerConfirm({
      quotationCustomerId: "cust-1",
      sessionCustomerId: "cust-1",
      status: "DRAFT",
      hasOpenNegotiation: false,
      requiresApproval: false,
    });
    expect(res.allowed).toBe(false);
  });

  it("forbids confirmation if negotiated terms trigger approval rules", () => {
    const res = canCustomerConfirm({
      quotationCustomerId: "cust-1",
      sessionCustomerId: "cust-1",
      status: "SENT",
      hasOpenNegotiation: false,
      requiresApproval: true,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("approval");
  });

  it("allows confirmation when legitimate customer owns quote, no open negotiation, and approval criteria met", () => {
    const res = canCustomerConfirm({
      quotationCustomerId: "cust-1",
      sessionCustomerId: "cust-1",
      status: "SENT",
      hasOpenNegotiation: false,
      requiresApproval: false,
    });
    expect(res.allowed).toBe(true);
  });
});
