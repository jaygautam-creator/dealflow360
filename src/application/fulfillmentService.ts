import "server-only";
import { prisma } from "@/infrastructure/db";
import { writeAudit } from "./quotationService";
import { scopedQuotationWhere } from "./queries";
import { DomainError } from "@/app/api/_lib/respond";
import type { SessionUser } from "@/infrastructure/auth/session";

export interface OverrideAllocationInput {
  lineId: string;
  warehouseId: string | null;
  quantity: number;
}

export interface FulfillmentOverrideInput {
  reason: string;
  allocations: OverrideAllocationInput[];
}

/**
 * Manually overrides the fulfillment allocation for a sales order.
 *
 * Enforces:
 *  - Order existence, tenancy/scoping, and non-terminal state
 *  - Physical line demand coverage (exact match of quantity per line)
 *  - Warehouse validity and active status
 *  - Real-time stock restoration of old allocations and reservation for new ones
 *  - Multi-warehouse shipment count and backorder status recalculation
 *  - Audited reason and state change tracking
 */
export async function overrideFulfillment(
  orderId: string,
  user: SessionUser,
  input: FulfillmentOverrideInput,
) {
  // Load order scoped to user's visibility
  const order = await prisma.salesOrder.findFirst({
    where: { AND: [{ id: orderId }, { quotation: scopedQuotationWhere(user) }] },
    include: {
      fulfillmentPlan: {
        include: { allocations: true },
      },
      quotation: {
        include: {
          lines: {
            include: { product: true },
          },
        },
      },
    },
  });

  if (!order) {
    throw new DomainError("Order not found or not accessible.");
  }

  if (order.status === "FULFILLED" || order.status === "CANCELLED") {
    throw new DomainError(`Cannot override fulfillment for an order that is ${order.status.toLowerCase()}.`);
  }

  if (!order.fulfillmentPlan) {
    throw new DomainError("Order does not have an active fulfillment plan to override.");
  }

  // Identify physical goods that require allocation
  const physicalLines = order.quotation.lines.filter((l) => l.product.kind === "ONE_TIME");
  const physicalLineMap = new Map(physicalLines.map((l) => [l.id, l]));

  if (input.allocations.length === 0) {
    throw new DomainError("At least one allocation is required.");
  }

  // 1. Verify every allocation line belongs to the physical lines of this order
  for (const alloc of input.allocations) {
    if (!physicalLineMap.has(alloc.lineId)) {
      throw new DomainError(`Line ID ${alloc.lineId} does not belong to this order's physical items.`);
    }
    if (alloc.quantity <= 0) {
      throw new DomainError("Allocation quantity must be greater than zero.");
    }
  }

  // 2. Verify total allocated quantity per line matches line quantity
  const allocatedPerLine = new Map<string, number>();
  for (const alloc of input.allocations) {
    allocatedPerLine.set(alloc.lineId, (allocatedPerLine.get(alloc.lineId) ?? 0) + alloc.quantity);
  }

  for (const line of physicalLines) {
    const totalAllocated = allocatedPerLine.get(line.id) ?? 0;
    if (totalAllocated !== line.quantity) {
      throw new DomainError(
        `Allocations for ${line.product.name} must total exactly ${line.quantity} units (got ${totalAllocated}).`,
      );
    }
  }

  // 3. Verify warehouses exist and are active
  const warehouseIds = Array.from(
    new Set(input.allocations.map((a) => a.warehouseId).filter((id): id is string => id !== null)),
  );

  if (warehouseIds.length > 0) {
    const validWarehouses = await prisma.warehouse.findMany({
      where: { id: { in: warehouseIds }, isActive: true },
      select: { id: true, name: true },
    });
    if (validWarehouses.length !== warehouseIds.length) {
      throw new DomainError("One or more selected warehouses are invalid or inactive.");
    }
  }

  // 4. Atomic inventory adjustment & plan update
  return prisma.$transaction(async (tx) => {
    // Release previously reserved stock
    for (const prev of order.fulfillmentPlan!.allocations) {
      if (!prev.isBackorder && prev.warehouseId) {
        await tx.stockLevel.update({
          where: {
            warehouseId_productId: {
              warehouseId: prev.warehouseId,
              productId: prev.productId,
            },
          },
          data: { quantity: { increment: prev.quantity } },
        });
      }
    }

    // Check availability and decrement stock for new allocations
    const warehouseProductDemand = new Map<string, { warehouseId: string; productId: string; quantity: number }>();
    for (const alloc of input.allocations) {
      if (!alloc.warehouseId) continue;
      const line = physicalLineMap.get(alloc.lineId)!;
      const key = `${alloc.warehouseId}:${line.productId}`;
      const existing = warehouseProductDemand.get(key);
      if (existing) {
        existing.quantity += alloc.quantity;
      } else {
        warehouseProductDemand.set(key, {
          warehouseId: alloc.warehouseId,
          productId: line.productId,
          quantity: alloc.quantity,
        });
      }
    }

    for (const demand of warehouseProductDemand.values()) {
      const stock = await tx.stockLevel.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: demand.warehouseId,
            productId: demand.productId,
          },
        },
        include: { warehouse: true, product: true },
      });

      if (!stock || stock.quantity < demand.quantity) {
        const whName = stock?.warehouse.name ?? "Warehouse";
        const prodName = stock?.product.name ?? "Product";
        throw new DomainError(
          `Insufficient stock in ${whName} for ${prodName}. Available: ${stock?.quantity ?? 0}, requested: ${demand.quantity}.`,
        );
      }

      await tx.stockLevel.update({
        where: {
          warehouseId_productId: {
            warehouseId: demand.warehouseId,
            productId: demand.productId,
          },
        },
        data: { quantity: { decrement: demand.quantity } },
      });
    }

    // Delete existing allocations
    await tx.fulfillmentAllocation.deleteMany({
      where: { planId: order.fulfillmentPlan!.id },
    });

    // Create new allocations
    await tx.fulfillmentAllocation.createMany({
      data: input.allocations.map((a) => {
        const line = physicalLineMap.get(a.lineId)!;
        return {
          planId: order.fulfillmentPlan!.id,
          lineId: a.lineId,
          productId: line.productId,
          warehouseId: a.warehouseId,
          quantity: a.quantity,
          isBackorder: a.warehouseId === null,
        };
      }),
    });

    const distinctWarehouses = new Set(
      input.allocations.map((a) => a.warehouseId).filter((id): id is string => id !== null),
    );
    const hasBackorder = input.allocations.some((a) => a.warehouseId === null);
    const backorderUnits = input.allocations
      .filter((a) => a.warehouseId === null)
      .reduce((s, a) => s + a.quantity, 0);

    // Update fulfillment plan
    await tx.fulfillmentPlan.update({
      where: { id: order.fulfillmentPlan!.id },
      data: {
        isManualOverride: true,
        shipmentCount: distinctWarehouses.size,
      },
    });

    // Update sales order status if backorder state changed
    const newStatus = hasBackorder ? "PARTIALLY_FULFILLED" : "CONFIRMED";
    if (order.status !== newStatus) {
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { status: newStatus },
      });
    }

    // Write audit event
    await writeAudit(tx, {
      entityType: "SalesOrder",
      entityId: order.id,
      action: "FULFILLMENT_OVERRIDDEN",
      actorId: user.id,
      reason: input.reason.trim(),
      payload: {
        reason: input.reason.trim(),
        shipmentCount: distinctWarehouses.size,
        hasBackorder,
        backorderUnits,
        allocations: input.allocations,
      },
    });

    return {
      success: true,
      isManualOverride: true,
      shipmentCount: distinctWarehouses.size,
      hasBackorder,
    };
  });
}
