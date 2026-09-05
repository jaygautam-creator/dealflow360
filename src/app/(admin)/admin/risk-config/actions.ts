"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserApi } from "@/infrastructure/auth/guards";
import { prisma } from "@/infrastructure/db";
import { guardConfigWrite } from "../_lib/authGuard";

const schema = z.object({
  aggregateAmplifier: z.coerce.number().min(0),
  stalledAfterDays: z.coerce.number().int().min(1),
  anomalyZThreshold: z.coerce.number().min(0),
  anomalyMinSamples: z.coerce.number().int().min(1),
});

export async function updateRiskConfig(formData: FormData) {
  const guardError = await guardConfigWrite();
  if (guardError) return guardError;
  const user = await requireUserApi();

  const parsed = schema.safeParse({
    aggregateAmplifier: formData.get("aggregateAmplifier"),
    stalledAfterDays: formData.get("stalledAfterDays"),
    anomalyZThreshold: formData.get("anomalyZThreshold"),
    anomalyMinSamples: formData.get("anomalyMinSamples"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    await tx.riskConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...parsed.data },
      update: parsed.data,
    });

    await tx.auditEvent.create({
      data: {
        entityType: "RiskConfig",
        entityId: "singleton",
        action: "UPDATED",
        actorId: user.id,
        reason: "Updated system risk parameters and anomaly thresholds",
        payload: parsed.data,
      },
    });
  });

  revalidatePath("/admin/risk-config");
}
