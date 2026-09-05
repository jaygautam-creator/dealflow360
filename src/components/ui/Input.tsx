"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, containerClassName, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={cn(errorId, hintId) || undefined}
        className={cn(
          "h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400",
          "focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600",
          "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400",
          "dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:disabled:bg-neutral-800",
          error &&
            "border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500",
          className
        )}
        {...props}
      />
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
