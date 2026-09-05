import type { HTMLAttributes, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "./cn";

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaLabel?: string;
  icon?: ReactNode;
}

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  className,
  ...props
}: StatTileProps) {
  const isPositive = typeof delta === "number" && delta >= 0;

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-[var(--color-hairline)] bg-surface p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {label}
        </p>
        {icon && <div className="shrink-0 text-neutral-400 dark:text-neutral-500">{icon}</div>}
      </div>
      <p className="mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums text-neutral-900 sm:text-3xl dark:text-neutral-100">
        {value}
      </p>
      {typeof delta === "number" && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            isPositive
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {isPositive ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          )}
          <span>
            {Math.abs(delta)}
            {deltaLabel ? ` ${deltaLabel}` : "%"}
          </span>
        </div>
      )}
    </div>
  );
}
