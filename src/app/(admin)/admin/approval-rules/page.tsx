import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createApprovalRule, deleteApprovalRule, updateApprovalRule } from "./actions";

export default async function ApprovalRulesPage() {
  const rules = await prisma.approvalRule.findMany({ orderBy: { sequence: "asc" } });

  const rows = rules.map((r) => ({
    id: r.id,
    name: r.name,
    minScore: r.minScore.toString(),
    maxScore: r.maxScore?.toString() ?? "",
    requiresManager: r.requiresManager,
    requiresFinance: r.requiresFinance,
    sequence: String(r.sequence),
  }));

  return (
    <EntityManager
      title="Approval Rules"
      subtitle="Score bands that route a quotation to the manager and/or finance. Editing a row here re-routes the very next quotation scored — no redeploy."
      emptyLabel="No approval rules configured. Every quotation will route with no approval required."
      rows={rows}
      columns={[
        { key: "sequence", header: "Order" },
        { key: "name", header: "Name" },
        {
          key: "range",
          header: "Score range",
          render: (row) => `${row.minScore} – ${row.maxScore || "∞"}`,
        },
        {
          key: "requires",
          header: "Requires",
          render: (row) => (
            <div className="flex gap-1">
              {row.requiresManager && <Badge tone="info">Manager</Badge>}
              {row.requiresFinance && <Badge tone="warning">Finance</Badge>}
              {!row.requiresManager && !row.requiresFinance && (
                <Badge tone="neutral">Auto-approve</Badge>
              )}
            </div>
          ),
        },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "sequence", label: "Order", type: "number", step: "1", required: true },
        {
          name: "minScore",
          label: "Min score (inclusive)",
          type: "number",
          step: "0.01",
          required: true,
        },
        {
          name: "maxScore",
          label: "Max score (exclusive, blank = unbounded)",
          type: "number",
          step: "0.01",
        },
        { name: "requiresManager", label: "Requires sales manager approval", type: "checkbox" },
        { name: "requiresFinance", label: "Requires finance approval", type: "checkbox" },
      ]}
      toFormValues={(row) => ({
        name: row.name,
        sequence: row.sequence,
        minScore: row.minScore,
        maxScore: row.maxScore,
        requiresManager: row.requiresManager,
        requiresFinance: row.requiresFinance,
      })}
      createAction={createApprovalRule}
      updateAction={updateApprovalRule}
      deleteAction={deleteApprovalRule}
    />
  );
}
