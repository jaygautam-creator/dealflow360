import "server-only";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { scopedQuotationWhere } from "@/application/queries";
import type { SessionUser } from "@/infrastructure/auth/session";
import type { Prisma, QuotationStatus } from "@/generated/prisma";
import { dbToPaise, dbToPct } from "@/infrastructure/money";

/**
 * Reports (spec A7)
 * =================
 *
 * One filter set drives both the on-screen table and the CSV/XLS export, so the two can
 * never drift apart — this module is the single source of truth for "what rows match the
 * filter", and the page and the export route just render it differently.
 *
 * "Approval status" is not a stored column: a quotation's `status` already encodes it
 * (`PENDING_MANAGER`/`PENDING_FINANCE` = pending, `REJECTED` = rejected, anything that
 * cleared approval = approved). Deriving it from `status` keeps this in lockstep with
 * `approvalService.ts`, which is the only place that actually transitions it.
 */

export const PERIOD_VALUES = ["today", "week", "month", "custom"] as const;
export const APPROVAL_STATUS_VALUES = ["all", "pending", "approved", "rejected"] as const;

export const ReportFiltersSchema = z.object({
  period: z.enum(PERIOD_VALUES).default("month"),
  from: z.string().optional(),
  to: z.string().optional(),
  repId: z.string().optional(),
  approvalStatus: z.enum(APPROVAL_STATUS_VALUES).default("all"),
  categoryId: z.string().optional(),
});

export type ReportFilters = z.infer<typeof ReportFiltersSchema>;

const PENDING_STATUSES: QuotationStatus[] = ["PENDING_MANAGER", "PENDING_FINANCE"];
const APPROVED_STATUSES: QuotationStatus[] = ["APPROVED", "SENT", "UNDER_NEGOTIATION", "CONFIRMED"];
const REJECTED_STATUSES: QuotationStatus[] = ["REJECTED"];

/** Parses filters out of a URLSearchParams-shaped object (works for both a page's searchParams and an API route's query string). */
export function parseReportFilters(raw: Record<string, string | undefined>): ReportFilters {
  return ReportFiltersSchema.parse({
    period: raw.period,
    from: raw.from,
    to: raw.to,
    repId: raw.repId || undefined,
    approvalStatus: raw.approvalStatus,
    categoryId: raw.categoryId || undefined,
  });
}

function periodRange(filters: ReportFilters): { gte: Date; lte: Date } | null {
  const now = new Date();
  if (filters.period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { gte: start, lte: end };
  }
  if (filters.period === "week") {
    // Monday-start week.
    const day = (now.getDay() + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { gte: start, lte: end };
  }
  if (filters.period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { gte: start, lte: end };
  }
  // custom
  if (!filters.from && !filters.to) return null;
  const gte = filters.from ? new Date(filters.from) : new Date(0);
  const toDate = filters.to ? new Date(filters.to) : now;
  // Inclusive of the whole "to" day.
  const lte = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
  return { gte, lte };
}

function approvalStatusWhere(filters: ReportFilters): Prisma.QuotationWhereInput {
  if (filters.approvalStatus === "pending") return { status: { in: PENDING_STATUSES } };
  if (filters.approvalStatus === "approved") return { status: { in: APPROVED_STATUSES } };
  if (filters.approvalStatus === "rejected") return { status: { in: REJECTED_STATUSES } };
  return {};
}

function buildWhere(user: SessionUser, filters: ReportFilters): Prisma.QuotationWhereInput {
  const range = periodRange(filters);
  const clauses: Prisma.QuotationWhereInput[] = [scopedQuotationWhere(user), approvalStatusWhere(filters)];

  if (range) clauses.push({ createdAt: range });
  if (filters.repId) clauses.push({ ownerId: filters.repId });
  if (filters.categoryId) clauses.push({ lines: { some: { product: { categoryId: filters.categoryId } } } });

  return { AND: clauses };
}

export interface ReportRow {
  id: string;
  number: string;
  customerName: string;
  ownerName: string;
  status: QuotationStatus;
  riskScore: number;
  discountPct: number;
  totalPaise: number;
  createdAt: Date;
}

export interface ReportResult {
  rows: ReportRow[];
  summary: {
    count: number;
    totalValuePaise: number;
    averageDiscountPct: number;
    averageRiskScore: number;
    approvalRatePct: number;
  };
}

export async function runReport(user: SessionUser, filters: ReportFilters): Promise<ReportResult> {
  const where = buildWhere(user, filters);

  const quotations = await prisma.quotation.findMany({
    where,
    select: {
      id: true,
      number: true,
      status: true,
      riskScore: true,
      subtotal: true,
      discountTotal: true,
      total: true,
      createdAt: true,
      customer: { select: { name: true } },
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: ReportRow[] = quotations.map((q) => {
    const subtotalPaise = dbToPaise(q.subtotal);
    const discountPaise = dbToPaise(q.discountTotal);
    return {
      id: q.id,
      number: q.number,
      customerName: q.customer.name,
      ownerName: q.owner.name,
      status: q.status,
      riskScore: dbToPct(q.riskScore),
      discountPct: subtotalPaise > 0 ? Math.round((discountPaise / subtotalPaise) * 10000) / 100 : 0,
      totalPaise: dbToPaise(q.total),
      createdAt: q.createdAt,
    };
  });

  const count = rows.length;
  const totalValuePaise = rows.reduce((s, r) => s + r.totalPaise, 0);
  const averageDiscountPct = count === 0 ? 0 : rows.reduce((s, r) => s + r.discountPct, 0) / count;
  const averageRiskScore = count === 0 ? 0 : rows.reduce((s, r) => s + r.riskScore, 0) / count;
  const decided = rows.filter((r) => APPROVED_STATUSES.includes(r.status) || REJECTED_STATUSES.includes(r.status));
  const approvalRatePct =
    decided.length === 0 ? 0 : (decided.filter((r) => APPROVED_STATUSES.includes(r.status)).length / decided.length) * 100;

  return {
    rows,
    summary: {
      count,
      totalValuePaise,
      averageDiscountPct: Math.round(averageDiscountPct * 100) / 100,
      averageRiskScore: Math.round(averageRiskScore * 100) / 100,
      approvalRatePct: Math.round(approvalRatePct * 100) / 100,
    },
  };
}

/** Sales reps for the filter dropdown — anyone who can own a quotation. */
export async function listSalesReps() {
  return prisma.user.findMany({
    where: { role: { in: ["SALES_REP", "SALES_MANAGER"] }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listCategories() {
  return prisma.productCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export function approvalStatusLabel(status: QuotationStatus): "pending" | "approved" | "rejected" | "other" {
  if (PENDING_STATUSES.includes(status)) return "pending";
  if (APPROVED_STATUSES.includes(status)) return "approved";
  if (REJECTED_STATUSES.includes(status)) return "rejected";
  return "other";
}
