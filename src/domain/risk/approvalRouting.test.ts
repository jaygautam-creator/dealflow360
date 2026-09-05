import { describe, it, expect } from "vitest";
import { routeForApproval, requiresReapproval, type ApprovalRuleInput } from "./approvalRouting";

// The default chain seeded into the database: clean quotes flow through, small breaches
// need a manager, large ones need finance as well.
const RULES: ApprovalRuleInput[] = [
  { id: "r1", name: "Within policy", minScore: 0, maxScore: 0.01, requiresManager: false, requiresFinance: false, sequence: 1 },
  { id: "r2", name: "Manager review", minScore: 0.01, maxScore: 5, requiresManager: true, requiresFinance: false, sequence: 2 },
  { id: "r3", name: "Manager then Finance", minScore: 5, maxScore: null, requiresManager: true, requiresFinance: true, sequence: 3 },
];

describe("approval routing", () => {
  it("auto-approves a quotation fully within policy", () => {
    const d = routeForApproval(0, RULES);
    expect(d.autoApprove).toBe(true);
    expect(d.requiredSteps).toEqual([]);
    expect(d.matchedRule!.name).toBe("Within policy");
  });

  it("routes a small breach to the sales manager only", () => {
    const d = routeForApproval(3, RULES);
    expect(d.autoApprove).toBe(false);
    expect(d.requiredSteps).toEqual([{ level: "SALES_MANAGER", sequence: 1 }]);
  });

  it("routes a large breach to the manager and then finance, in that order", () => {
    const d = routeForApproval(9, RULES);
    expect(d.requiredSteps).toEqual([
      { level: "SALES_MANAGER", sequence: 1 },
      { level: "FINANCE", sequence: 2 },
    ]);
    expect(d.explanation).toContain("Sales Manager, then Finance");
  });

  it("treats the band lower bound as inclusive and the upper bound as exclusive", () => {
    expect(routeForApproval(5, RULES).requiredSteps).toHaveLength(2); // hits r3, not r2
    expect(routeForApproval(4.99, RULES).requiredSteps).toHaveLength(1);
  });

  it("reads the bands from configuration rather than hardcoding them", () => {
    // A stricter policy where any breach at all goes straight to finance.
    const strict: ApprovalRuleInput[] = [
      { id: "s1", name: "Within policy", minScore: 0, maxScore: 0.01, requiresManager: false, requiresFinance: false, sequence: 1 },
      { id: "s2", name: "Everything else", minScore: 0.01, maxScore: null, requiresManager: true, requiresFinance: true, sequence: 2 },
    ];
    expect(routeForApproval(3, RULES).requiredSteps).toHaveLength(1);
    expect(routeForApproval(3, strict).requiredSteps).toHaveLength(2);
  });

  it("fails closed when the configured bands leave a gap", () => {
    const gapped: ApprovalRuleInput[] = [
      { id: "g1", name: "Low", minScore: 0, maxScore: 2, requiresManager: false, requiresFinance: false, sequence: 1 },
      { id: "g2", name: "High", minScore: 10, maxScore: null, requiresManager: true, requiresFinance: true, sequence: 2 },
    ];
    const d = routeForApproval(5, gapped); // falls in the hole between the two bands
    expect(d.autoApprove).toBe(false);
    expect(d.requiredSteps).toHaveLength(2);
    expect(d.explanation).toContain("fail closed");
  });

  it("fails closed when no rules are configured at all", () => {
    expect(routeForApproval(1, []).autoApprove).toBe(false);
  });
});

describe("re-approval after an edit", () => {
  it("restarts the chain when an edit lengthens it", () => {
    // The classic exploit: get a clean quote approved, then raise the discount.
    const r = requiresReapproval(3, 9, RULES);
    expect(r.required).toBe(true);
    expect(r.reason).toContain("longer approval chain");
  });

  it("requires review when an edit moves the quote into a different band", () => {
    const r = requiresReapproval(0, 3, RULES);
    expect(r.required).toBe(true);
  });

  it("keeps existing approvals when the score stays inside the same band", () => {
    const r = requiresReapproval(2, 4, RULES);
    expect(r.required).toBe(false);
    expect(r.reason).toContain("still stand");
  });

  it("does not force re-approval when the score drops", () => {
    expect(requiresReapproval(9, 7, RULES).required).toBe(false);
  });
});
