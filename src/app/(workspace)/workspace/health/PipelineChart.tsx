"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/**
 * Pipeline by stage.
 *
 * Colour carries meaning rather than decoration: amber for anything waiting on a human,
 * green for closed-won, red for lost. A reader should be able to spot a bottleneck without
 * consulting a legend.
 */
const TONE: Record<string, string> = {
  DRAFT: "#a3a3a3",
  PENDING_MANAGER: "#f59e0b",
  PENDING_FINANCE: "#f59e0b",
  APPROVED: "#6366f1",
  SENT: "#6366f1",
  UNDER_NEGOTIATION: "#8b5cf6",
  CONFIRMED: "#10b981",
  REJECTED: "#ef4444",
  CANCELLED: "#ef4444",
};

export function PipelineChart({ data }: { data: { status: string; count: number; value: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">No quotations yet.</p>;
  }

  const chartData = data.map((d) => ({
    ...d,
    label: d.status.replaceAll("_", " ").toLowerCase(),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-neutral-500"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-neutral-500" allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(99,102,241,0.08)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e5" }}
            formatter={(value) => [`${value} quotation(s)`, "Count"]}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((d) => (
              <Cell key={d.status} fill={TONE[d.status] ?? "#a3a3a3"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
