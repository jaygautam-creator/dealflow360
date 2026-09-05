import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

/**
 * Demo seed.
 *
 * This data is not decorative. It is shaped so that every rule in the system is
 * observable without the operator having to construct a special case by hand:
 *
 *  - Category ceilings differ from tier ceilings, so the "stricter ceiling wins" rule
 *    is visible on a single quotation.
 *  - Warehouse stock is deliberately split so that a realistic order *cannot* ship from
 *    one place and the planner is forced to prove itself.
 *  - The sales rep carries a consistent low-discount history, so a generous quote trips
 *    the per-rep anomaly detector rather than a hardcoded threshold.
 *  - One quotation is left deliberately old so the stalled-deal detector has something
 *    real to find.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "demo1234";

async function main() {
  console.log("Clearing existing data...");
  // Deleted child-first so foreign keys never block the reset.
  await prisma.auditEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billingSchedule.deleteMany();
  await prisma.fulfillmentAllocation.deleteMany();
  await prisma.fulfillmentPlan.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.negotiationMessage.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.quotationLine.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.upsellRule.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.priceListItem.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.approvalRule.deleteMany();
  await prisma.tierDiscountCeiling.deleteMany();
  await prisma.riskConfig.deleteMany();
  await prisma.user.deleteMany();
  await prisma.customer.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Governance configuration ────────────────────────────────────────────────
  console.log("Seeding governance configuration...");

  await prisma.riskConfig.create({
    data: {
      id: "singleton",
      aggregateAmplifier: 1.5,
      stalledAfterDays: 5,
      anomalyZThreshold: 2.0,
      anomalyMinSamples: 3,
    },
  });

  // Tier ceilings widen with customer value; category ceilings can override downwards.
  await prisma.tierDiscountCeiling.createMany({
    data: [
      { tier: "BRONZE", maxDiscountPct: 5 },
      { tier: "SILVER", maxDiscountPct: 10 },
      { tier: "GOLD", maxDiscountPct: 15 },
    ],
  });

  await prisma.approvalRule.createMany({
    data: [
      { name: "Within policy", minScore: 0, maxScore: 0.01, requiresManager: false, requiresFinance: false, sequence: 1 },
      { name: "Manager review", minScore: 0.01, maxScore: 5, requiresManager: true, requiresFinance: false, sequence: 2 },
      { name: "Manager then Finance", minScore: 5, maxScore: null, requiresManager: true, requiresFinance: true, sequence: 3 },
    ],
  });

  // ── Catalogue ───────────────────────────────────────────────────────────────
  console.log("Seeding catalogue...");

  // Hardware carries healthy margin so it tolerates the full tier discount.
  // Services are thin, so their ceiling sits below even a Gold customer's entitlement —
  // this is the asymmetry that makes the blended score meaningful.
  const hardware = await prisma.productCategory.create({ data: { name: "Hardware", maxDiscountPct: 15 } });
  const service = await prisma.productCategory.create({ data: { name: "Service", maxDiscountPct: 10 } });
  const subscription = await prisma.productCategory.create({ data: { name: "Subscription", maxDiscountPct: 12 } });

  const monthlyPlan = await prisma.subscriptionPlan.create({
    data: { name: "Monthly Support", interval: "MONTHLY", prorateOnChange: true, refundPctOnCancel: 100 },
  });
  const annualPlan = await prisma.subscriptionPlan.create({
    data: { name: "Annual Cloud", interval: "YEARLY", prorateOnChange: true, refundPctOnCancel: 50 },
  });

  const laptop = await prisma.product.create({
    data: { sku: "HW-LAP-14", name: 'Workstation Laptop 14"', description: "Developer-grade portable workstation.", kind: "ONE_TIME", categoryId: hardware.id, listPrice: 100000, cost: 68000, uom: "Unit" },
  });
  const server = await prisma.product.create({
    data: { sku: "HW-SRV-R550", name: "Rack Server R550", description: "2U dual-socket rack server.", kind: "ONE_TIME", categoryId: hardware.id, listPrice: 450000, cost: 320000, uom: "Unit" },
  });
  const dock = await prisma.product.create({
    data: { sku: "HW-DOCK-01", name: "Docking Station", description: "Thunderbolt dock.", kind: "ONE_TIME", categoryId: hardware.id, listPrice: 12000, cost: 7000, isPromoted: true, uom: "Unit" },
  });
  const setup = await prisma.product.create({
    data: { sku: "SV-SETUP", name: "Onsite Setup Service", description: "Engineer-led installation.", kind: "SERVICE", categoryId: service.id, listPrice: 20000, cost: 14000, uom: "Day" },
  });
  const migration = await prisma.product.create({
    data: { sku: "SV-MIGRATE", name: "Data Migration Service", description: "Managed data migration.", kind: "SERVICE", categoryId: service.id, listPrice: 35000, cost: 26000, uom: "Project" },
  });
  const supportPlan = await prisma.product.create({
    data: { sku: "SUB-SUPPORT", name: "Priority Support Plan", description: "24x7 priority support.", kind: "SUBSCRIPTION", categoryId: subscription.id, listPrice: 5000, cost: 1500, defaultPlanId: monthlyPlan.id, uom: "Month" },
  });
  const backup = await prisma.product.create({
    data: { sku: "SUB-BACKUP", name: "Cloud Backup", description: "Offsite encrypted backup.", kind: "SUBSCRIPTION", categoryId: subscription.id, listPrice: 60000, cost: 20000, defaultPlanId: annualPlan.id, uom: "Year" },
  });

  await prisma.productVariant.createMany({
    data: [
      { productId: laptop.id, attribute: "Memory", value: "16 GB", extraPrice: 0 },
      { productId: laptop.id, attribute: "Memory", value: "32 GB", extraPrice: 18000 },
      { productId: server.id, attribute: "Storage", value: "2 TB", extraPrice: 0 },
      { productId: server.id, attribute: "Storage", value: "8 TB", extraPrice: 95000 },
    ],
  });

  // Tier price lists: better standing earns a better base price, before any discount.
  const goldList = await prisma.priceList.create({ data: { name: "Gold Pricing", tier: "GOLD", currency: "INR" } });
  const silverList = await prisma.priceList.create({ data: { name: "Silver Pricing", tier: "SILVER", currency: "INR" } });
  const allProducts = [laptop, server, dock, setup, migration, supportPlan, backup];

  await prisma.priceListItem.createMany({
    data: allProducts.map((p) => ({ priceListId: goldList.id, productId: p.id, price: Number(p.listPrice) * 0.92 })),
  });
  await prisma.priceListItem.createMany({
    data: allProducts.map((p) => ({ priceListId: silverList.id, productId: p.id, price: Number(p.listPrice) * 0.96 })),
  });

  // ── Inventory: split on purpose ─────────────────────────────────────────────
  console.log("Seeding warehouses with deliberately split stock...");

  const main = await prisma.warehouse.create({ data: { code: "MAIN", name: "Main Warehouse", shippingCostWeight: 1.0 } });
  const east = await prisma.warehouse.create({ data: { code: "EAST", name: "East Depot", shippingCostWeight: 2.5 } });

  // Neither warehouse can fill a combined laptop + server order alone. Main is deep on
  // laptops and empty on servers; East is the reverse. Any realistic mixed order therefore
  // exercises the greedy split rather than the single-warehouse fast path.
  await prisma.stockLevel.createMany({
    data: [
      { warehouseId: main.id, productId: laptop.id, quantity: 50, reorderPoint: 10 },
      { warehouseId: main.id, productId: dock.id, quantity: 100, reorderPoint: 20 },
      { warehouseId: main.id, productId: server.id, quantity: 2, reorderPoint: 5 },
      { warehouseId: east.id, productId: laptop.id, quantity: 5, reorderPoint: 10 },
      { warehouseId: east.id, productId: dock.id, quantity: 20, reorderPoint: 20 },
      { warehouseId: east.id, productId: server.id, quantity: 20, reorderPoint: 5 },
    ],
  });

  await prisma.upsellRule.createMany({
    data: [
      { triggerProductId: laptop.id, suggestedProductId: dock.id, coPurchaseScore: 85, minMarginPct: 20 },
      { triggerProductId: laptop.id, suggestedProductId: supportPlan.id, coPurchaseScore: 72, minMarginPct: 30 },
      { triggerProductId: server.id, suggestedProductId: setup.id, coPurchaseScore: 64, minMarginPct: 25 },
      { triggerProductId: server.id, suggestedProductId: backup.id, coPurchaseScore: 58, minMarginPct: 40 },
      { triggerProductId: laptop.id, suggestedProductId: migration.id, coPurchaseScore: 41, minMarginPct: 30 },
    ],
  });

  // ── People ──────────────────────────────────────────────────────────────────
  console.log("Seeding customers and users...");

  const acme = await prisma.customer.create({ data: { name: "Acme Corp", email: "buyer@acme.test", tier: "GOLD", city: "Bengaluru", country: "India" } });
  const beta = await prisma.customer.create({ data: { name: "Beta Industries", email: "ops@beta.test", tier: "SILVER", city: "Pune", country: "India" } });
  const cygnus = await prisma.customer.create({ data: { name: "Cygnus Ltd", email: "admin@cygnus.test", tier: "BRONZE", city: "Chennai", country: "India" } });

  const admin = await prisma.user.create({ data: { email: "admin@dealflow.test", name: "Aarti Desai", role: "ADMIN", passwordHash } });
  const rep = await prisma.user.create({ data: { email: "rep@dealflow.test", name: "Priya Nair", role: "SALES_REP", passwordHash } });
  const rep2 = await prisma.user.create({ data: { email: "rep2@dealflow.test", name: "Vikram Rao", role: "SALES_REP", passwordHash } });
  const manager = await prisma.user.create({ data: { email: "manager@dealflow.test", name: "Rahul Sharma", role: "SALES_MANAGER", passwordHash } });
  const finance = await prisma.user.create({ data: { email: "finance@dealflow.test", name: "Meera Iyer", role: "FINANCE", passwordHash } });
  // Portal users are scoped to exactly one customer — that link is the tenancy boundary.
  await prisma.user.create({ data: { email: "buyer@acme.test", name: "Nimesh Pathak", role: "PORTAL", passwordHash, customerId: acme.id } });

  // ── Historical quotations ───────────────────────────────────────────────────
  // Priya has a consistent low-discount record. That history is what lets the anomaly
  // detector judge her against herself instead of a company-wide number.
  console.log("Seeding quotation history for anomaly detection...");

  const history = [
    { discount: 2, days: 60 },
    { discount: 3, days: 48 },
    { discount: 2, days: 35 },
    { discount: 3, days: 22 },
    { discount: 2, days: 14 },
  ];

  let seq = 1;
  for (const h of history) {
    const created = daysAgo(h.days);
    const unitPrice = 100000;
    const qty = 4;
    const gross = unitPrice * qty;
    const discountAmt = (gross * h.discount) / 100;
    const net = gross - discountAmt;

    await prisma.quotation.create({
      data: {
        number: `QUO-2026-${String(seq++).padStart(4, "0")}`,
        status: "CONFIRMED",
        customerId: beta.id,
        ownerId: rep.id,
        riskScore: 0,
        subtotal: gross,
        discountTotal: discountAmt,
        taxTotal: net * 0.18,
        total: net * 1.18,
        marginPct: 32,
        createdAt: created,
        lastActivityAt: created,
        lines: {
          create: [{ productId: laptop.id, quantity: qty, unitPrice, unitCost: 68000, discountPct: h.discount, taxPct: 18, lineType: "ONE_TIME", sequence: 1 }],
        },
      },
    });
  }

  // A deal deliberately left cold, so the stalled detector has a real one to surface.
  await prisma.quotation.create({
    data: {
      number: `QUO-2026-${String(seq++).padStart(4, "0")}`,
      status: "SENT",
      customerId: cygnus.id,
      ownerId: rep2.id,
      riskScore: 0,
      subtotal: 240000,
      discountTotal: 0,
      taxTotal: 43200,
      total: 283200,
      marginPct: 31,
      createdAt: daysAgo(20),
      lastActivityAt: daysAgo(12),
      lines: { create: [{ productId: dock.id, quantity: 20, unitPrice: 12000, unitCost: 7000, discountPct: 0, taxPct: 18, lineType: "ONE_TIME", sequence: 1 }] },
    },
  });

  await prisma.auditEvent.create({
    data: { entityType: "System", entityId: "seed", action: "DATABASE_SEEDED", reason: "Demo dataset loaded", payload: { quotations: seq - 1 } },
  });

  console.log("\nSeed complete.");
  console.log(`  Customers: Acme Corp (Gold), Beta Industries (Silver), Cygnus Ltd (Bronze)`);
  console.log(`  Ceilings:  Bronze 5% / Silver 10% / Gold 15%; Hardware 15% / Service 10% / Subscription 12%`);
  console.log(`  Stock:     Main = 50 laptops, 2 servers | East = 5 laptops, 20 servers  (a mixed order must split)`);
  console.log(`  History:   Priya Nair has 5 confirmed quotes at 2-3% discount`);
  console.log(`\n  All logins use the password: ${DEMO_PASSWORD}`);
  console.log(`    admin@dealflow.test    Admin`);
  console.log(`    rep@dealflow.test      Sales Rep`);
  console.log(`    manager@dealflow.test  Sales Manager`);
  console.log(`    finance@dealflow.test  Finance`);
  console.log(`    buyer@acme.test        Customer portal (Acme Corp only)`);
  void [admin, manager, finance];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
