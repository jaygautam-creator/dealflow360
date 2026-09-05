import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { RiskAssessment } from "@/domain/risk/types";

/**
 * The explainability panel.
 *
 * A risk score on its own is an assertion. This renders the full decision trace behind it:
 * every line, which ceiling bound it and where that ceiling came from, how far over it
 * went, and which of the two signals ultimately drove the score.
 *
 * It exists because an approver asked to sign off on "8" deserves to see why it is 8, and
 * because a scoring engine that cannot show its work is indistinguishable from one that
 * made the number up.
 */
export function RiskPanel({
  assessment,
  explanation,
}: {
  assessment: RiskAssessment;
  explanation: string;
}) {
  const clean = assessment.score === 0;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>Discount risk</CardTitle>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{explanation}</p>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`text-4xl font-bold tabular-nums leading-none ${
              clean
                ? "text-emerald-600 dark:text-emerald-400"
                : assessment.score >= 5
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {assessment.score}
          </div>
          <p className="mt-1 text-xs font-medium text-neutral-500">points over ceiling</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Both signals are always shown, including the one that lost, so an approver can
            see that the other failure mode was checked rather than ignored. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SignalTile
            label="Severity"
            hint="Worst single line"
            value={assessment.severitySignal}
            active={assessment.drivingSignal === "SEVERITY"}
          />
          <SignalTile
            label="Aggregate"
            hint={`Value-weighted spread, amplified`}
            value={assessment.amplifiedAggregate}
            active={assessment.drivingSignal === "AGGREGATE"}
          />
        </div>

        {assessment.totalGiveawayPaise > 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <strong className="tabular-nums">
              {formatPaise(assessment.totalGiveawayPaise)}
            </strong>{" "}
            given away beyond policy across {assessment.breachingLineCount} line
            {assessment.breachingLineCount === 1 ? "" : "s"}.
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                <th className="pb-2 pr-3 font-medium">Line</th>
                <th className="pb-2 pr-3 font-medium">Ceiling</th>
                <th className="pb-2 pr-3 text-right font-medium">Given</th>
                <th className="pb-2 pr-3 text-right font-medium">Over by</th>
                <th className="pb-2 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {assessment.lines.map((line) => (
                <tr key={line.lineId} className={line.isBreaching ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {line.productName}
                    </div>
                    <div className="text-xs text-neutral-500">{line.categoryName}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="tabular-nums">{line.effectiveCeilingPct}%</span>
                    {/* Naming the source is the point: it explains why a Gold customer's
                        15% entitlement did not apply to a Services line. */}
                    <div className="text-xs text-neutral-500">
                      {line.ceilingSource === "CATEGORY"
                        ? "set by category"
                        : line.ceilingSource === "TIER"
                          ? "set by tier"
                          : "tier = category"}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{line.discountPct}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {line.isBreaching ? (
                      <Badge tone="danger">+{line.breachPts}</Badge>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">
                    {(line.valueWeight * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalTile({
  label,
  hint,
  value,
  active,
}: {
  label: string;
  hint: string;
  value: number;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        active
          ? "border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
        <span className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
          {value}
        </span>
      </div>
      <p className="text-xs text-neutral-500">{hint}</p>
      {active ? (
        <p className="mt-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          drove the score
        </p>
      ) : null}
    </div>
  );
}

function formatPaise(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
