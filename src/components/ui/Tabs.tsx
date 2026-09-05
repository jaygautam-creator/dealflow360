"use client";

import { useId } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "./cn";

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  const baseId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((item) => !item.disabled);
    const currentIndex = enabled.findIndex((item) => item.value === value);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % enabled.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;

    if (nextIndex !== null) {
      event.preventDefault();
      onChange(enabled[nextIndex].value);
    }
  }

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            id={`${baseId}-tab-${item.value}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
