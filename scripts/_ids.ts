// Resolves seed-data ids for scripts/verify-flow.sh. Not part of the application.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
  });
  const out = {
    acme: (await prisma.customer.findFirstOrThrow({ where: { tier: "GOLD" } })).id,
    laptop: (await prisma.product.findFirstOrThrow({ where: { sku: "HW-LAP-14" } })).id,
    setup: (await prisma.product.findFirstOrThrow({ where: { sku: "SV-SETUP" } })).id,
    server: (await prisma.product.findFirstOrThrow({ where: { sku: "HW-SRV-R550" } })).id,
    support: (await prisma.product.findFirstOrThrow({ where: { sku: "SUB-SUPPORT" } })).id,
  };
  console.log(JSON.stringify(out));
  await prisma.$disconnect();
}
main();
