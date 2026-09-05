export type ApprovalLevel = "SALES_MANAGER" | "FINANCE";

export interface ApprovalRuleInput {
  id: string;
  name: string;
  /** Inclusive lower bound of the score band. */
  minScore: number;
  /** Exclusive upper bound. Null means the band is unbounded above. */
  maxScore: number | null;
  requiresManager: boolean;
  requiresFinance: boolean;
  sequence: number;
}

export interface RequiredStep {
  level: ApprovalLevel;
  sequence: number;
}

export interface RoutingDecision {
  matchedRule: ApprovalRuleInput | null;
  requiredSteps: RequiredStep[];
  /** True when the quotation may be confirmed with no human approval. */
  autoApprove: boolean;
  explanation: string;
}

/**
 * Approval routing
 * ================
 *
 * Turns a risk score into the chain of humans who must sign off. The bands live in the
 * ApprovalRule table rather than in this file, so a sales director can retune escalation
 * from the admin screen and the very next quotation routes differently — no redeploy.
 *
 * Steps are always emitted in sequence order (manager before finance), because finance
 * should never be asked to review something the manager has not yet seen.
 */
export function routeForApproval(
  score: number,
  rules: readonly ApprovalRuleInput[],
): RoutingDecision {
  // Lowest band first, so the first match is always the narrowest applicable rule.
  const ordered = [...rules].sort((a, b) =>
    a.sequence === b.sequence ? a.minScore - b.minScore : a.sequence - b.sequence,
  );

  const matched =
    ordered.find(
      (r) => score >= r.minScore && (r.maxScore === null || score < r.maxScore),
    ) ?? null;

  if (matched === null) {
    // No configured band covers this score. Failing closed — escalating rather than
    // auto-approving — is the safe default for a governance system.
    return {
      matchedRule: null,
      requiredSteps: [
        { level: "SALES_MANAGER", sequence: 1 },
        { level: "FINANCE", sequence: 2 },
      ],
      autoApprove: false,
      explanation: `No approval band covers a score of ${score}. Escalating to both approvers, because a governance rule with a gap in it must fail closed, never open.`,
    };
  }

  const steps: RequiredStep[] = [];
  if (matched.requiresManager) steps.push({ level: "SALES_MANAGER", sequence: steps.length + 1 });
  if (matched.requiresFinance) steps.push({ level: "FINANCE", sequence: steps.length + 1 });

  if (steps.length === 0) {
    return {
      matchedRule: matched,
      requiredSteps: [],
      autoApprove: true,
      explanation: `Score ${score} falls in "${matched.name}", which needs no approval. The quotation can be confirmed directly.`,
    };
  }

  const who = steps.map((s) => (s.level === "SALES_MANAGER" ? "Sales Manager" : "Finance"));
  return {
    matchedRule: matched,
    requiredSteps: steps,
    autoApprove: false,
    explanation: `Score ${score} falls in "${matched.name}", which requires ${who.join(", then ")}.`,
  };
}

/**
 * Decides what happens to an in-flight approval chain when the quotation is edited.
 *
 * Re-scoring after every edit is what stops the obvious exploit: submit a clean quote,
 * get it approved, then quietly raise the discount. If the new score demands more than
 * the already-completed steps covered, the chain restarts.
 */
export function requiresReapproval(
  previousScore: number,
  newScore: number,
  rules: readonly ApprovalRuleInput[],
): { required: boolean; reason: string } {
  const before = routeForApproval(previousScore, rules);
  const after = routeForApproval(newScore, rules);

  if (after.requiredSteps.length > before.requiredSteps.length) {
    return {
      required: true,
      reason: `The change raised the risk score from ${previousScore} to ${newScore}, which now needs a longer approval chain. Previous approvals no longer cover it.`,
    };
  }

  const beforeLevels = before.requiredSteps.map((s) => s.level).join(">");
  const afterLevels = after.requiredSteps.map((s) => s.level).join(">");
  if (beforeLevels !== afterLevels) {
    return {
      required: true,
      reason: `The change moved the quotation into a different approval band (${afterLevels || "none"}), so it must be re-reviewed.`,
    };
  }

  return {
    required: false,
    reason: `The score moved from ${previousScore} to ${newScore} but stayed within the same approval band, so existing approvals still stand.`,
  };
}
