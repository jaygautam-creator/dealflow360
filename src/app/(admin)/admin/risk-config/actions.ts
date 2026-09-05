"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";

const schema = z.object({
  aggregateAmplifier: z.coerce.number().min(0),
  stalledAfterDays: z.coerce.number().int().min(1),
  anomalyZThreshold: z.coerce.number().min(0),
  anomalyMinSamples: z.coerce.number().int().min(1),
});

export async function updateRiskConfig(formData: FormData) {
  const parsed = schema.safeParse({
    aggregateAmplifier: formData.get("aggregateAmplifier"),
    stalledAfterDays: formData.get("stalledAfterDays"),
    anomalyZThreshold: formData.get("anomalyZThreshold"),
    anomalyMinSamples: formData.get("anomalyMinSamples"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.riskConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed.data },
    update: parsed.data,
  });
  revalidatePath("/admin/risk-config");
}
