import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../ui/cn";

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
