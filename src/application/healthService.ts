import "server-only";
import { prisma } from "@/infrastructure/db";
import { dbToPct } from "@/infrastructure/money";
import { checkStalled, checkDiscountAnomaly, checkDeliverySlippage } from "@/domain/health/dealHealth";
import { scopedQuotationWhere } from "./queries";
import type { SessionUser } from "@/infrastructure/auth/session";

/**
 * Deal health.
 *
 * The dashboard reads live records rather than a pre-computed summary table, because a
 * stale alert is worse than no alert — a manager who learns to distrust the numbers stops
 * reading them. At this data size the aggregation is cheap; the note in docs/ROADMAP.md
 * records what would change at scale.
 *
 * Every threshold comes from RiskConfig, so the sensitivity of the whole dashboard is
 * tunable from the admin screen without touching code.
 */

export interface HealthReport {
  config: { stalledAfterDays: number; anomalyZThreshold: number; anomalyMinSamples: number };
  kpis: {
    openQuotations: number;
    awaitingApproval: number;
    confirmedValue: number;
    openValue: number;
    averageRiskScore: number;
    upsellAcceptedCount: number;
  };
  stalled: { id: string; number: string; customerName: string; ownerName: string; total: number; daysInactive: number; explanation: string }[];
  anomalies: { id: string; number: string; customerName: string; ownerName: string; discountPct: number; zScore: number; mean: number; explanation: string }[];
  slipping: { id: string; number: string; customerName: string; daysLate: number; explanation: string }[];
  backorders: { orderNumber: string; productName: string; quantity: number }[];
  byStatus: { status: string; count: number; value: number }[];
  byOwner: { ownerName: string; count: number; value: number; averageDiscount: number }[];
}

export async function buildHealthReport(user: SessionUser, now = new Date()): Promise<HealthReport> {
  const quotationScope = scopedQuotationWhere(user);
  const [config, quotations, backorderRows] = await Promise.all([
    prisma.riskConfig.findUnique({ where: { id: "singleton" } }),
    prisma.quotation.findMany({
      where: quotationScope,
      include: {
        customer: { select: { name: true } },
        owner: { select: { id: true, name: true } },
        lines: { select: { discountPct: true } },
        salesOrder: { select: { fulfillmentPlan: { select: { allocations: { where: { isBackorder: true }, include: { product: true } } } }, number: true } },
      },
      orderBy: { lastActivityAt: "desc" },
    }),
    prisma.fulfillmentAllocation.findMany({
      where: {
        isBackorder: true,
        plan: { salesOrder: { quotation: quotationScope } },
      },
      include: { product: true, plan: { include: { salesOrder: true } } },
    }),
  ]);

  const stalledAfterDays = config?.stalledAfterDays ?? 5;
  const anomalyZThreshold = config ? dbToPct(config.anomalyZThreshold) : 2;
  const anomalyMinSamples = config?.anomalyMinSamples ?? 3;

  /** A quotation's headline discount: the value-weighted view is in the risk trace, so
   *  for anomaly purposes the simple mean across lines is the right, explainable input. */
  const meanDiscount = (lines: { discountPct: unknown }[]) =>
    lines.length === 0 ? 0 : lines.reduce((s, l) => s + dbToPct(l.discountPct as never), 0) / lines.length;

  // Each rep's history is their own *settled* quotations. Including in-flight ones would
  // let a rep normalise their own outlier by raising several at once.
  const historyByOwner = new Map<string, number[]>();
  for (const q of quotations) {
    if (q.status !== "CONFIRMED") continue;
    const list = historyByOwner.get(q.owner.id) ?? [];
    list.push(meanDiscount(q.lines));
    historyByOwner.set(q.owner.id, list);
  }

  const OPEN = ["DRAFT", "PENDING_MANAGER", "PENDING_FINANCE", "APPROVED", "SENT", "UNDER_NEGOTIATION"];

  const stalled: HealthReport["stalled"] = [];
  const anomalies: HealthReport["anomalies"] = [];
  const slipping: HealthReport["slipping"] = [];

  for (const q of quotations) {
    if (!OPEN.includes(q.status)) continue;

    const stall = checkStalled(q.lastActivityAt, now, stalledAfterDays);
    if (stall.isStalled) {
      stalled.push({
        id: q.id, number: q.number, customerName: q.customer.name, ownerName: q.owner.name,
        total: Number(q.total), daysInactive: stall.daysInactive, explanation: stall.explanation,
      });
    }

    const discount = meanDiscount(q.lines);
    const history = (historyByOwner.get(q.owner.id) ?? []).filter((_, i, arr) => arr.length > 0);
    const anomaly = checkDiscountAnomaly(history, discount, anomalyZThreshold, anomalyMinSamples);
    if (anomaly.isAnomaly) {
      anomalies.push({
        id: q.id, number: q.number, customerName: q.customer.name, ownerName: q.owner.name,
        discountPct: Math.round(discount * 100) / 100,
        zScore: Number.isFinite(anomaly.zScore) ? anomaly.zScore : 99,
        mean: anomaly.mean, explanation: anomaly.explanation,
      });
    }

    const slip = checkDeliverySlippage(q.promisedDate, q.validUntil);
    if (slip.isSlipping) {
      slipping.push({ id: q.id, number: q.number, customerName: q.customer.name, daysLate: slip.daysLate, explanation: slip.explanation });
    }
  }

  const open = quotations.filter((q) => OPEN.includes(q.status));
  const confirmed = quotations.filter((q) => q.status === "CONFIRMED");

  const statusGroups = new Map<string, { count: number; value: number }>();
  for (const q of quotations) {
    const g = statusGroups.get(q.status) ?? { count: 0, value: 0 };
    g.count += 1;
    g.value += Number(q.total);
    statusGroups.set(q.status, g);
  }

  const ownerGroups = new Map<string, { count: number; value: number; discountSum: number }>();
  for (const q of quotations) {
    const g = ownerGroups.get(q.owner.name) ?? { count: 0, value: 0, discountSum: 0 };
    g.count += 1;
    g.value += Number(q.total);
    g.discountSum += meanDiscount(q.lines);
    ownerGroups.set(q.owner.name, g);
  }

  const upsellAccepted = await prisma.quotationLine.count({
    where: { fromUpsell: true, quotation: quotationScope },
  });

  return {
    config: { stalledAfterDays, anomalyZThreshold, anomalyMinSamples },
    kpis: {
      openQuotations: open.length,
      awaitingApproval: quotations.filter((q) => q.status === "PENDING_MANAGER" || q.status === "PENDING_FINANCE").length,
      confirmedValue: confirmed.reduce((s, q) => s + Number(q.total), 0),
      openValue: open.reduce((s, q) => s + Number(q.total), 0),
      averageRiskScore:
        open.length === 0 ? 0 : Math.round((open.reduce((s, q) => s + dbToPct(q.riskScore), 0) / open.length) * 100) / 100,
      upsellAcceptedCount: upsellAccepted,
    },
    stalled: stalled.sort((a, b) => b.daysInactive - a.daysInactive),
    anomalies: anomalies.sort((a, b) => b.zScore - a.zScore),
    slipping,
    backorders: backorderRows.map((b) => ({
      orderNumber: b.plan.salesOrder.number,
      productName: b.product.name,
      quantity: b.quantity,
    })),
    byStatus: [...statusGroups.entries()].map(([status, g]) => ({ status, ...g })).sort((a, b) => b.count - a.count),
    byOwner: [...ownerGroups.entries()]
      .map(([ownerName, g]) => ({
        ownerName, count: g.count, value: g.value,
        averageDiscount: Math.round((g.discountSum / g.count) * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value),
  };
}
