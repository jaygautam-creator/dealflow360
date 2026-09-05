import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="text-neutral-400 dark:text-neutral-500" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
