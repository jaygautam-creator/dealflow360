import { prisma } from "@/infrastructure/db";
import { EntityManager } from "../_components/EntityManager";
import { createApprovalRule, deleteApprovalRule, updateApprovalRule } from "./actions";

export const metadata = { title: "Approval Rules" };

export default async function ApprovalRulesPage() {
  const rules = await prisma.approvalRule.findMany({ orderBy: { sequence: "asc" } });

  const rows = rules.map((r) => ({
    id: r.id,
    name: r.name,
    sequence: String(r.sequence),
    minScore: r.minScore.toString(),
    maxScore: r.maxScore?.toString() ?? "",
    range: `${r.minScore.toString()} – ${r.maxScore?.toString() ?? "∞"}`,
    requiresManager: r.requiresManager,
    requiresFinance: r.requiresFinance,
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
        { key: "range", header: "Score range" },
        {
          key: "requiresManager",
          header: "Manager",
          kind: "badge",
          toneMap: { true: "info", false: "neutral" },
          labelMap: { true: "Required", false: "—" },
        },
        {
          key: "requiresFinance",
          header: "Finance",
          kind: "badge",
          toneMap: { true: "warning", false: "neutral" },
          labelMap: { true: "Required", false: "—" },
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
      createAction={createApprovalRule}
      updateAction={updateApprovalRule}
      deleteAction={deleteApprovalRule}
    />
  );
}
