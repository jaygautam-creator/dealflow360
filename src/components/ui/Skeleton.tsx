import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800",
        className
      )}
      {...props}
    />
  );
}
