/**
 * Pipeline by stage.
 *
 * Written as plain SVG rather than pulling in a charting library. This is one bar chart
 * with no interaction beyond a tooltip, and a general-purpose charting package would add
 * a large dependency, a client-component boundary and an API to learn — for something
 * that is forty lines of arithmetic. It also stays a Server Component this way, so the
 * chart ships as markup with no JavaScript at all.
 *
 * Colour carries meaning rather than decoration: amber for anything waiting on a human,
 * indigo for in-flight, green for closed-won, red for lost. A reader should be able to
 * spot a bottleneck without consulting a legend.
 */

const TONE: Record<string, string> = {
  DRAFT: "#a1a1aa",
  PENDING_MANAGER: "#f59e0b",
  PENDING_FINANCE: "#f59e0b",
  APPROVED: "#6366f1",
  SENT: "#6366f1",
  UNDER_NEGOTIATION: "#8b5cf6",
  CONFIRMED: "#10b981",
  REJECTED: "#ef4444",
  CANCELLED: "#ef4444",
};

export function PipelineChart({
  data,
}: {
  data: { status: string; count: number; value: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">No quotations yet.</p>;
  }

  const max = Math.max(...data.map((d) => d.count));
  const barHeight = 28;
  const gap = 10;
  const labelWidth = 132;
  const chartWidth = 260;
  const height = data.length * (barHeight + gap);

  return (
    <div className="overflow-x-auto">
      <svg
        width={labelWidth + chartWidth + 56}
        height={height}
        role="img"
        aria-label="Quotations by pipeline stage"
        className="max-w-full"
      >
        {data.map((d, i) => {
          const y = i * (barHeight + gap);
          // Guard against a zero max, which would make every bar NaN wide.
          const width = max === 0 ? 0 : Math.max((d.count / max) * chartWidth, 3);
          return (
            <g key={d.status}>
              <text
                x={labelWidth - 10}
                y={y + barHeight / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-neutral-600 text-[11px]"
              >
                {d.status.replaceAll("_", " ").toLowerCase()}
              </text>
              <rect
                x={labelWidth}
                y={y + 4}
                width={width}
                height={barHeight - 8}
                rx={4}
                fill={TONE[d.status] ?? "#a1a1aa"}
              />
              <text
                x={labelWidth + width + 8}
                y={y + barHeight / 2}
                dominantBaseline="central"
                className="fill-neutral-700 text-[11px] tabular-nums"
              >
                {d.count}
              </text>
              <title>
                {d.status.replaceAll("_", " ").toLowerCase()}: {d.count} quotation
                {d.count === 1 ? "" : "s"}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
