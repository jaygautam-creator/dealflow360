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
        "rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </p>
        {icon && <div className="text-neutral-400 dark:text-neutral-500">{icon}</div>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
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
