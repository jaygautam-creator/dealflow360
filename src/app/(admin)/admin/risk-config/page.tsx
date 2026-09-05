import { PageHeader } from "@/components/layout/PageHeader";
import { prisma } from "@/infrastructure/db";
import { RiskConfigForm } from "./RiskConfigForm";

export default async function RiskConfigPage() {
  const config = await prisma.riskConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return (
    <div>
      <PageHeader
        title="Risk Config"
        subtitle="The tunables the blended risk score and deal-health detectors read at runtime. This is the single source of truth — nothing here is hardcoded in the engines."
      />
      <RiskConfigForm
        defaults={{
          aggregateAmplifier: config.aggregateAmplifier.toString(),
          stalledAfterDays: String(config.stalledAfterDays),
          anomalyZThreshold: config.anomalyZThreshold.toString(),
          anomalyMinSamples: String(config.anomalyMinSamples),
        }}
      />
    </div>
  );
}
