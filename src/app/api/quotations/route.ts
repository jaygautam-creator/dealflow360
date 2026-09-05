import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { writeAudit } from "@/application/quotationService";

const CreateSchema = z.object({
  customerId: z.string().min(1, "Choose a customer."),
  promisedDate: z.string().datetime().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermissionApi(P.QUOTATION_CREATE);
    const input = CreateSchema.parse(await request.json());

    const quotation = await prisma.$transaction(async (tx) => {
      const count = await tx.quotation.count();
      const created = await tx.quotation.create({
        data: {
          number: `QUO-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
          customerId: input.customerId,
          // Ownership comes from the session, never from the request body — otherwise a
          // rep could create quotations attributed to a colleague.
          ownerId: user.id,
          status: "DRAFT",
          promisedDate: input.promisedDate ? new Date(input.promisedDate) : null,
        },
      });
      await writeAudit(tx, {
        entityType: "Quotation",
        entityId: created.id,
        action: "QUOTATION_CREATED",
        actorId: user.id,
        reason: `Created for customer ${input.customerId}`,
      });
      return created;
    });

    return NextResponse.json({ id: quotation.id, number: quotation.number }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
