"use client";

import { Button } from "@/components/ui/Button";

/**
 * PDF via the browser's own print engine, not a library: `window.print()` plus the
 * print stylesheet in globals.css produces a clean PDF through the OS print dialog's
 * "Save as PDF", so this screen needs no PDF-generation dependency at all.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  );
}
