import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800",
        className
      )}
      {...props}
    />
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn(
        "text-sm font-semibold text-neutral-900 dark:text-neutral-100",
        className
      )}
      {...props}
    />
  );
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
