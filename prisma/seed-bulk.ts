import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type Prisma,
  type CustomerTier,
  type QuotationStatus,
  type LineType,
} from "../src/generated/prisma";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// Hardcoded seed pools (no external dependencies / faker)
const COMPANY_PREFIXES = [
  "Acme", "Apex", "Atlas", "Bluefin", "Cascade", "Crest", "Delta",
  "Echo", "Epsilon", "Falcon", "Genesis", "Horizon", "Infinity", "Jupiter",
  "Krypton", "Lunar", "Matrix", "Nexus", "Nova", "Omega", "Orion",
  "Pinnacle", "Prism", "Quantum", "Radiant", "Sierra", "Summit", "Titan",
  "Trident", "Unified", "Vanguard", "Velocity", "Vertex", "Vision", "Zenith",
  "Aerospace", "Cyber", "Frontier", "Global", "Sterling",
];

const COMPANY_SUFFIXES = [
  "Industrial", "Technologies", "Solutions", "Enterprises", "Systems",
  "Logistics", "Manufacturing", "Labs", "Networks", "Robotics",
  "Analytics", "Ventures", "Energy", "Software", "Consulting", "Dynamics",
];

const CITIES = [
  "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune",
  "Chennai", "Kolkata", "Ahmedabad", "Gurugram", "Noida",
];

const TIERS: CustomerTier[] = ["BRONZE", "SILVER", "GOLD"];

// CONFIRMED is deliberately absent.
//
// Confirmation is not a status the application ever sets on its own: confirmationService
// creates the SalesOrder, the warehouse split, the invoices and the billing schedules in
// one transaction, and the status change is part of that same transaction. A CONFIRMED
// quotation with no order behind it is a state the system cannot produce, so generating
// one would put a lie in the database — and fabricating the downstream records instead
// would misrepresent work the confirmation transaction never did.
const ALL_STATUSES: QuotationStatus[] = [
  "DRAFT",
  "PENDING_MANAGER",
  "PENDING_FINANCE",
  "APPROVED",
  "REJECTED",
  "SENT",
  "UNDER_NEGOTIATION",
  "CANCELLED",
];

const SANE_QUANTITIES = [1, 2, 3, 4, 5, 8, 10];

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Ensures discount is strictly below both the customer tier ceiling and category ceiling,
 * keeping risk score at 0.
 */
function getSafeDiscountPct(
  tier: CustomerTier,
  categoryMaxDiscount: number,
  seedIdx: number,
): number {
  const tierCeiling = tier === "BRONZE" ? 5 : tier === "SILVER" ? 10 : 15;
  const ceiling = Math.min(tierCeiling, categoryMaxDiscount);
  const maxAllowed = ceiling - 1;
  if (maxAllowed <= 0) return 0;

  const choices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((d) => d <= maxAllowed);
  return choices[seedIdx % choices.length] ?? 0;
}

async function main() {
  const startTime = Date.now();
  console.log("Starting bulk data generation for scalability demonstration...");

  // 1. Resolve existing sales reps and products
  const salesReps = await prisma.user.findMany({
    where: { role: "SALES_REP" },
    select: { id: true, name: true },
  });
  if (salesReps.length === 0) {
    throw new Error("No sales reps found in database. Please run 'npm run db:seed' first.");
  }

  const products = await prisma.product.findMany({
    include: { category: true },
  });
  if (products.length === 0) {
    throw new Error("No products found in database. Please run 'npm run db:seed' first.");
  }

  // 2. Scan existing bulk records to guarantee uniqueness across re-runs
  const existingBulkCustomers = await prisma.customer.findMany({
    where: { name: { startsWith: "[BULK] " } },
    select: { name: true },
  });
  let maxCustomerSeq = 0;
  for (const c of existingBulkCustomers) {
    const match = c.name.match(/\[BULK\] .* (\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxCustomerSeq) maxCustomerSeq = n;
    }
  }
  if (maxCustomerSeq === 0 && existingBulkCustomers.length > 0) {
    maxCustomerSeq = existingBulkCustomers.length;
  }

  const existingBulkQuotations = await prisma.quotation.findMany({
    where: { number: { startsWith: "[BULK] QUO-" } },
    select: { number: true },
  });
  let maxQuotationSeq = 0;
  for (const q of existingBulkQuotations) {
    const match = q.number.match(/\[BULK\] QUO-(?:2026-)?(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxQuotationSeq) maxQuotationSeq = n;
    }
  }
  if (maxQuotationSeq === 0 && existingBulkQuotations.length > 0) {
    maxQuotationSeq = existingBulkQuotations.length;
  }

interface BulkCustomerRecord {
  id: string;
  name: string;
  email: string;
  tier: CustomerTier;
  currency: string;
  city: string;
  country: string;
  createdAt: Date;
}

  // 3. Generate 40 customers spread across BRONZE / SILVER / GOLD
  const CUSTOMER_COUNT = 40;
  const customers: BulkCustomerRecord[] = [];
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const seq = maxCustomerSeq + i + 1;
    const seqStr = String(seq).padStart(3, "0");
    const prefix = COMPANY_PREFIXES[i % COMPANY_PREFIXES.length];
    const suffix = COMPANY_SUFFIXES[(i * 3) % COMPANY_SUFFIXES.length];
    const city = CITIES[i % CITIES.length];
    const tier = TIERS[i % TIERS.length];

    customers.push({
      id: generateId("bulk_cust"),
      name: `[BULK] ${prefix} ${suffix} ${seqStr}`,
      email: `buyer${seqStr}@bulk-${prefix.toLowerCase()}.test`,
      tier,
      currency: "INR",
      city,
      country: "India",
      createdAt: daysAgo(30 + (i % 60)),
    });
  }

  console.log(`Inserting ${customers.length} bulk customers...`);
  await prisma.$transaction(async (tx) => {
    await tx.customer.createMany({ data: customers });
  });

  // 4. Generate ~400 quotations (405: 45 across each of the 9 QuotationStatuses)
  const QUOTATION_COUNT = 405;
  const quotations: Prisma.QuotationCreateManyInput[] = [];
  const allLines: Prisma.QuotationLineCreateManyInput[] = [];

  for (let i = 0; i < QUOTATION_COUNT; i++) {
    const seq = maxQuotationSeq + i + 1;
    const seqStr = String(seq).padStart(4, "0");
    const quotationId = generateId("bulk_quo");
    const customer = customers[i % customers.length];
    const owner = salesReps[i % salesReps.length];
    const status = ALL_STATUSES[i % ALL_STATUSES.length];

    const createdDaysAgo = ((i * 7) % 90) + 1;
    const createdAt = daysAgo(createdDaysAgo);
    const activeDaysAgo = Math.floor(createdDaysAgo * 0.3);
    const lastActivityAt = daysAgo(activeDaysAgo);
    const promisedDate = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const validUntil = new Date(createdAt.getTime() + 45 * 24 * 60 * 60 * 1000);

    // 1 to 3 lines per quotation
    const lineCount = (i % 3) + 1;
    const quoteLines: Prisma.QuotationLineCreateManyInput[] = [];

    let quoteSubtotalPaise = 0;
    let quoteDiscountPaise = 0;
    let quoteNetPaise = 0;
    let quoteTaxPaise = 0;
    let quoteCostPaise = 0;

    for (let j = 0; j < lineCount; j++) {
      const product = products[(i * 3 + j) % products.length];
      const quantity = SANE_QUANTITIES[(i + j) % SANE_QUANTITIES.length];
      const categoryCeiling = Number(product.category.maxDiscountPct);
      const discountPct = getSafeDiscountPct(customer.tier, categoryCeiling, i + j);

      const unitPrice = Number(product.listPrice);
      const unitCost = Number(product.cost);
      const taxPct = Number(product.taxPct);

      // Exact integer paise arithmetic to avoid any floating-point representation drift
      const unitPricePaise = Math.round(unitPrice * 100);
      const unitCostPaise = Math.round(unitCost * 100);
      const grossPaise = unitPricePaise * quantity;
      const discountPaise = Math.round((grossPaise * discountPct) / 100);
      const netPaise = grossPaise - discountPaise;
      const taxPaise = Math.round((netPaise * taxPct) / 100);
      const costPaise = unitCostPaise * quantity;

      quoteSubtotalPaise += grossPaise;
      quoteDiscountPaise += discountPaise;
      quoteNetPaise += netPaise;
      quoteTaxPaise += taxPaise;
      quoteCostPaise += costPaise;

      const lineType: LineType = product.kind === "SUBSCRIPTION" ? "RECURRING" : "ONE_TIME";

      quoteLines.push({
        id: generateId("bulk_line"),
        quotationId,
        productId: product.id,
        variantId: null,
        quantity,
        unitPrice,
        unitCost,
        discountPct,
        taxPct,
        lineType,
        planId: product.defaultPlanId,
        fromUpsell: false,
        sequence: j + 1,
      });
    }

    const subtotal = quoteSubtotalPaise / 100;
    const discountTotal = quoteDiscountPaise / 100;
    const taxTotal = quoteTaxPaise / 100;
    const total = (quoteNetPaise + quoteTaxPaise) / 100;
    const marginPct =
      quoteNetPaise > 0
        ? Math.round(((quoteNetPaise - quoteCostPaise) / quoteNetPaise) * 10000) / 100
        : 0;

    quotations.push({
      id: quotationId,
      number: `[BULK] QUO-2026-${seqStr}`,
      status,
      customerId: customer.id,
      ownerId: owner.id,
      riskScore: 0,
      subtotal,
      discountTotal,
      taxTotal,
      total,
      marginPct,
      lastActivityAt,
      promisedDate,
      validUntil,
      createdAt,
      updatedAt: createdAt,
    });

    allLines.push(...quoteLines);
  }

  // 5. Batch createMany wrapped in transactions
  const BATCH_SIZE = 100;
  const batchCount = Math.ceil(quotations.length / BATCH_SIZE);
  console.log(
    `Inserting ${quotations.length} quotations and ${allLines.length} lines across ${batchCount} batched transactions...`,
  );

  for (let b = 0; b < quotations.length; b += BATCH_SIZE) {
    const batchQuotes = quotations.slice(b, b + BATCH_SIZE);
    const batchQuoteIds = new Set(batchQuotes.map((q) => q.id));
    const batchLines = allLines.filter((l) => batchQuoteIds.has(l.quotationId));

    await prisma.$transaction(async (tx) => {
      await tx.quotation.createMany({ data: batchQuotes });
      await tx.quotationLine.createMany({ data: batchLines });
    });
  }

  const elapsedMs = Date.now() - startTime;
  const statusCounts: Record<string, number> = {};
  for (const q of quotations) {
    const s = q.status ?? "UNKNOWN";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  console.log(`\nBulk seed complete in ${elapsedMs}ms.`);
  console.log(`  Customers created:       ${customers.length}`);
  console.log(`  Quotations created:      ${quotations.length}`);
  console.log(`  Quotation lines created: ${allLines.length}`);
  console.log(`  Batches committed:       ${batchCount}`);
  console.log(
    `  Quotation statuses:      ${Object.entries(statusCounts)
      .map(([s, c]) => `${s} (${c})`)
      .join(", ")}`,
  );
}

main()
  .catch((e) => {
    console.error("Bulk seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
