import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "./cn";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
}

export function Table({ className, wrapperClassName, ...props }: TableProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-x-auto overscroll-x-contain",
        wrapperClassName
      )}
    >
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export type THeadProps = HTMLAttributes<HTMLTableSectionElement>;

export function THead({ className, ...props }: THeadProps) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400",
        className
      )}
      {...props}
    />
  );
}

export type TBodyProps = HTMLAttributes<HTMLTableSectionElement>;

export function TBody({ className, ...props }: TBodyProps) {
  return (
    <tbody
      className={cn(
        "divide-y divide-neutral-200 [&>tr:nth-child(even)]:bg-neutral-50/60 dark:divide-neutral-800 dark:[&>tr:nth-child(even)]:bg-neutral-800/20",
        className
      )}
      {...props}
    />
  );
}

export type TRProps = HTMLAttributes<HTMLTableRowElement>;

export function TR({ className, ...props }: TRProps) {
  return (
    <tr
      className={cn(
        "hover:bg-neutral-50 dark:hover:bg-neutral-900/60",
        className
      )}
      {...props}
    />
  );
}

export type THProps = ThHTMLAttributes<HTMLTableCellElement>;

export function TH({ className, ...props }: THProps) {
  return (
    <th
      className={cn("whitespace-nowrap px-4 py-3.5 font-semibold", className)}
      scope="col"
      {...props}
    />
  );
}

export type TDProps = TdHTMLAttributes<HTMLTableCellElement>;

export function TD({ className, ...props }: TDProps) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 text-neutral-800 dark:text-neutral-200",
        className
      )}
      {...props}
    />
  );
}
