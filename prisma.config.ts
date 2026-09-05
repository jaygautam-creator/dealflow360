import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 keeps the connection URL out of schema.prisma so the schema stays a pure,
 * environment-free description of the data model. The URL is supplied here for the CLI
 * (migrate / introspect) and via a driver adapter for the runtime client.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
