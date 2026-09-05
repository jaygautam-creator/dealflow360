import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

/**
 * Prisma client, wired through the node-postgres driver adapter.
 *
 * Runtime queries use the *pooled* connection string. Serverless functions open and close
 * constantly, and a pooler is what stops that from exhausting Postgres connection slots.
 * Migrations use the unpooled URL instead (see prisma.config.ts) because DDL and advisory
 * locks do not survive a transaction pooler.
 *
 * The client is cached on globalThis in development so Next.js hot reload does not leak a
 * new connection pool on every file save. In production the module is evaluated once.
 */

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in a Postgres connection string.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    transactionOptions: {
      // Prisma's 5s default assumes a database on the same machine. This one is a hosted
      // Postgres several hundred milliseconds away, and confirming an order legitimately
      // performs a dozen sequential statements. The budget is raised to match reality
      // rather than splitting the work into transactions that could half-apply.
      timeout: 20_000,
      maxWait: 10_000,
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
