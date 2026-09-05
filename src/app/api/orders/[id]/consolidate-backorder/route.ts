import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError, DomainError } from "@/app/api/_lib/respond";
import { prisma } from "@/infrastructure/db";
import { writeAudit } from "@/application/quotationService";

const BodySchema = z.object({
  warehouseId: z.string().min(1, "Target warehouse is required."),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermissionApi(P.FULFILLMENT_OVERRIDE);
    const { id: orderId } = await ctx.params;
    const { warehouseId } = BodySchema.parse(await request.json());

    return await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: {
          fulfillmentPlan: {
            include: {
              allocations: {
                include: { product: true },
              },
            },
          },
        },
      });

      if (!order || !order.fulfillmentPlan) {
        throw new DomainError("Order or fulfillment plan not found.");
      }
      if (order.status === "FULFILLED" || order.status === "CANCELLED") {
        throw new DomainError(`Cannot consolidate backorders for an order that is ${order.status.toLowerCase()}.`);
      }

      const backorders = order.fulfillmentPlan.allocations.filter((a) => a.isBackorder);
      if (backorders.length === 0) {
        throw new DomainError("This order has no outstanding backorders to consolidate.");
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { id: warehouseId, isActive: true },
        include: { stockLevels: true },
      });
      if (!warehouse) {
        throw new DomainError("Selected warehouse is invalid or inactive.");
      }

      // Check stock availability in target warehouse for all backordered items
      const stockMap = new Map(warehouse.stockLevels.map((s) => [s.productId, s.quantity]));
      const neededByProduct = new Map<string, number>();
      for (const b of backorders) {
        neededByProduct.set(b.productId, (neededByProduct.get(b.productId) ?? 0) + b.quantity);
      }

      for (const [productId, needed] of neededByProduct.entries()) {
        const available = stockMap.get(productId) ?? 0;
        if (available < needed) {
          const prodName = backorders.find((b) => b.productId === productId)?.product.name ?? "item";
          throw new DomainError(`Insufficient stock in ${warehouse.name} for ${prodName} (available: ${available}, needed: ${needed}).`);
        }
      }

      // Decrement stock from the target warehouse
      for (const [productId, needed] of neededByProduct.entries()) {
        await tx.stockLevel.update({
          where: {
            warehouseId_productId: {
              warehouseId,
              productId,
            },
          },
          data: { quantity: { decrement: needed } },
        });
      }

      // Update backordered allocations to the consolidated warehouse
      await tx.fulfillmentAllocation.updateMany({
        where: {
          planId: order.fulfillmentPlan.id,
          isBackorder: true,
        },
        data: {
          warehouseId,
          isBackorder: false,
        },
      });

      // Recalculate distinct shipment count
      const allAllocations = await tx.fulfillmentAllocation.findMany({
        where: { planId: order.fulfillmentPlan.id },
      });
      const distinctWarehouses = new Set(
        allAllocations.map((a) => a.warehouseId).filter((wid): wid is string => wid !== null),
      );

      await tx.fulfillmentPlan.update({
        where: { id: order.fulfillmentPlan.id },
        data: {
          isManualOverride: true,
          shipmentCount: distinctWarehouses.size,
        },
      });

      // Order now has zero backorders -> mark CONFIRMED
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { status: "CONFIRMED" },
      });

      await writeAudit(tx, {
        entityType: "SalesOrder",
        entityId: order.id,
        action: "BACKORDER_CONSOLIDATED",
        actorId: user.id,
        reason: `Consolidated ${backorders.length} backordered line(s) into ${warehouse.name}`,
        payload: {
          warehouseId,
          warehouseName: warehouse.name,
          consolidatedUnits: backorders.reduce((s, b) => s + b.quantity, 0),
        },
      });

      return NextResponse.json({
        ok: true,
        warehouseName: warehouse.name,
        shipmentCount: distinctWarehouses.size,
      });
    });
  } catch (error) {
    return apiError(error);
  }
}
