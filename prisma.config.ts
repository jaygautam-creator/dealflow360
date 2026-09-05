import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Vercel writes provisioned credentials to .env.local; a plain .env is the fallback for
// a developer running their own Postgres. Next.js loads these itself at runtime, but the
// Prisma CLI does not, so they are loaded explicitly here.
loadEnv({ path: ".env.local" });
loadEnv();

/**
 * Prisma 7 keeps the connection URL out of schema.prisma, so the schema stays a pure,
 * environment-free description of the data model.
 *
 * Migrations deliberately use the *unpooled* connection. PgBouncer-style pooling does not
 * support the session-level advisory locks and DDL that Prisma Migrate relies on, so
 * pointing migrations at the pooled URL fails in ways that are hard to diagnose. Runtime
 * queries still go through the pooled URL via the driver adapter.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
