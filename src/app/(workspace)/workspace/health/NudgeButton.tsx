"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Fires the nudge endpoint for one quotation without navigating away from the alert. */
export function NudgeButton({ quotationId }: { quotationId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (state !== "idle") return;
    setState("busy");
    try {
      const res = await fetch(`/api/quotations/${quotationId}/nudge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setState(res.ok ? "done" : "idle");
    } catch {
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" /> Nudged
      </span>
    );
  }

  return (
    <Button size="sm" variant="ghost" loading={state === "busy"} leftIcon={<Bell className="size-3.5" />} onClick={onClick}>
      Nudge owner
    </Button>
  );
}
