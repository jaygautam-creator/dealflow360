"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600 disabled:bg-indigo-300 dark:disabled:bg-indigo-900/60",
  secondary:
    "bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50 focus-visible:outline-indigo-600 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 focus-visible:outline-indigo-600 dark:text-neutral-300 dark:hover:bg-neutral-800",
  danger:
    "bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600 disabled:bg-red-300 dark:disabled:bg-red-900/60",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    leftIcon,
    rightIcon,
    className,
    children,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
