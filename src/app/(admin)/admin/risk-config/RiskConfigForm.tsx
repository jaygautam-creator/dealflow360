"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { updateRiskConfig } from "./actions";

export interface RiskConfigValues {
  aggregateAmplifier: string;
  stalledAfterDays: string;
  anomalyZThreshold: string;
  anomalyMinSamples: string;
}

export function RiskConfigForm({ defaults }: { defaults: RiskConfigValues }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSaved(false);
    const result = await updateRiskConfig(formData);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaved(true);
  }

  return (
    <Card className="max-w-xl">
      <CardContent>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <Input
            name="aggregateAmplifier"
            label="Aggregate amplifier"
            type="number"
            step="0.01"
            required
            hint="Multiplier applied to the value-weighted aggregate breach signal. Higher makes many small over-discounts escalate sooner relative to one bad line."
            defaultValue={defaults.aggregateAmplifier}
          />
          <Input
            name="stalledAfterDays"
            label="Stalled after (days)"
            type="number"
            step="1"
            required
            hint="A quotation with no activity for this many days is reported as stalled."
            defaultValue={defaults.stalledAfterDays}
          />
          <Input
            name="anomalyZThreshold"
            label="Anomaly z-threshold"
            type="number"
            step="0.01"
            required
            hint="Discount anomaly threshold, in standard deviations above the rep's own rolling mean."
            defaultValue={defaults.anomalyZThreshold}
          />
          <Input
            name="anomalyMinSamples"
            label="Anomaly min samples"
            type="number"
            step="1"
            required
            hint="Minimum quotation history a rep needs before anomaly detection is meaningful."
            defaultValue={defaults.anomalyMinSamples}
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {saved && !error && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Saved. New quotations will use these values immediately.
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
