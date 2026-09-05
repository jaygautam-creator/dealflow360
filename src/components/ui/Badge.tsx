import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  success:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
  warning:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  danger: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  info: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400",
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
