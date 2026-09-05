// Resolves ids for the verification scripts. Not part of the application.
//
// Without an argument: prints the seed ids the flow script needs.
// With a quotation id:  prints the id of that quotation's newest open counter-offer,
//                       which the negotiation test needs in order to accept it.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
  });

  const quotationId = process.argv[2];

  if (quotationId) {
    const message = await prisma.negotiationMessage.findFirst({
      where: { quotationId, status: "OPEN", requestedDiscountPct: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    console.log(JSON.stringify({ messageId: message?.id ?? null }));
  } else {
    console.log(
      JSON.stringify({
        acme: (await prisma.customer.findFirstOrThrow({ where: { tier: "GOLD" } })).id,
        laptop: (await prisma.product.findFirstOrThrow({ where: { sku: "HW-LAP-14" } })).id,
        setup: (await prisma.product.findFirstOrThrow({ where: { sku: "SV-SETUP" } })).id,
        server: (await prisma.product.findFirstOrThrow({ where: { sku: "HW-SRV-R550" } })).id,
        support: (await prisma.product.findFirstOrThrow({ where: { sku: "SUB-SUPPORT" } })).id,
      }),
    );
  }
  await prisma.$disconnect();
}
main();
