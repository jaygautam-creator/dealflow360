"use client";

import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, id, className, containerClassName, children, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  const hintId = hint ? `${selectId}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error || undefined}
          aria-describedby={cn(errorId, hintId) || undefined}
          className={cn(
            "h-10 w-full appearance-none rounded-md border border-neutral-300 bg-white pl-3 pr-9 text-sm text-neutral-900",
            "focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600",
            "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400",
            "dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:disabled:bg-neutral-800",
            error &&
              "border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        />
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
