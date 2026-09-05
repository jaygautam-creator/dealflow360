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
    <div className={cn("w-full overflow-x-auto", wrapperClassName)}>
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export interface THeadProps extends HTMLAttributes<HTMLTableSectionElement> {}

export function THead({ className, ...props }: THeadProps) {
  return (
    <thead
      className={cn(
        "border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400",
        className
      )}
      {...props}
    />
  );
}

export interface TBodyProps extends HTMLAttributes<HTMLTableSectionElement> {}

export function TBody({ className, ...props }: TBodyProps) {
  return (
    <tbody
      className={cn(
        "divide-y divide-neutral-200 dark:divide-neutral-800",
        className
      )}
      {...props}
    />
  );
}

export interface TRProps extends HTMLAttributes<HTMLTableRowElement> {}

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

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {}

export function TH({ className, ...props }: THProps) {
  return <th className={cn("px-4 py-3 font-medium", className)} scope="col" {...props} />;
}

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {}

export function TD({ className, ...props }: TDProps) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-neutral-800 dark:text-neutral-200",
        className
      )}
      {...props}
    />
  );
}
