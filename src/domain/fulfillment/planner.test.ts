import { describe, it, expect } from "vitest";
import { planFulfillment, findConsolidationOpportunity } from "./planner";
import { toPaise } from "../shared/money";
import type { DemandLine, WarehouseStock } from "./types";

function wh(id: string, weight: number, available: Record<string, number>): WarehouseStock {
  return {
    warehouseId: id,
    warehouseCode: id.toUpperCase(),
    warehouseName: `${id} Warehouse`,
    shippingCostWeight: weight,
    available,
  };
}

function demand(lineId: string, productId: string, quantity: number, rupees: number): DemandLine {
  return { lineId, productId, productName: productId, quantity, valuePaise: toPaise(rupees) };
}

describe("fulfilment planner — single warehouse fast path", () => {
  it("ships everything from one warehouse when one can cover the whole order", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 5, 50_000), demand("L2", "table", 2, 40_000)],
      warehouses: [
        wh("main", 1, { chair: 10, table: 10 }),
        wh("east", 2, { chair: 10, table: 10 }),
      ],
    });
    expect(plan.strategy).toBe("SINGLE_WAREHOUSE");
    expect(plan.shipmentCount).toBe(1);
    expect(plan.isSingleShipment).toBe(true);
    expect(plan.hasBackorder).toBe(false);
    expect(plan.allocations).toHaveLength(2);
  });

  it("prefers the cheaper warehouse when several could ship the whole order alone", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 5, 50_000)],
      warehouses: [wh("expensive", 9, { chair: 100 }), wh("cheap", 1, { chair: 100 })],
    });
    expect(plan.allocations[0].warehouseId).toBe("cheap");
    expect(plan.totalShippingCost).toBe(1);
  });

  it("aggregates demand across two lines of the same product before deciding", () => {
    // 6 + 6 = 12 chairs needed, but the warehouse only holds 10 — so no single-shipment path.
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 6, 60_000), demand("L2", "chair", 6, 60_000)],
      warehouses: [wh("main", 1, { chair: 10 }), wh("east", 2, { chair: 10 })],
    });
    expect(plan.strategy).toBe("GREEDY_SPLIT");
    expect(plan.hasBackorder).toBe(false);
  });
});

describe("fulfilment planner — greedy split", () => {
  it("splits across two warehouses when no single one can cover the order", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 10, 100_000), demand("L2", "table", 4, 80_000)],
      warehouses: [wh("main", 1, { chair: 10, table: 0 }), wh("east", 2, { chair: 0, table: 4 })],
    });
    expect(plan.strategy).toBe("GREEDY_SPLIT");
    expect(plan.shipmentCount).toBe(2);
    expect(plan.hasBackorder).toBe(false);
    expect(plan.totalShippingCost).toBe(3);
  });

  it("picks the warehouse covering the most order value first", () => {
    const plan = planFulfillment({
      lines: [
        demand("CHEAP", "screw", 100, 1_000), // low value, high unit count
        demand("PRICEY", "server", 2, 500_000), // high value, low unit count
      ],
      warehouses: [
        wh("bulk", 1, { screw: 1000, server: 0 }),
        wh("premium", 1, { screw: 0, server: 5 }),
      ],
    });
    // Value, not unit count, drives the ordering — the server warehouse goes first.
    expect(plan.trace[0].warehouseId).toBe("premium");
  });

  it("does not reuse a warehouse it has already shipped from", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 15, 150_000)],
      warehouses: [wh("a", 1, { chair: 10 }), wh("b", 1, { chair: 10 })],
    });
    const ids = plan.allocations.filter((a) => !a.isBackorder).map((a) => a.warehouseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.shipmentCount).toBe(2);
  });

  it("records a readable trace of every decision", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 10, 100_000), demand("L2", "table", 4, 80_000)],
      warehouses: [wh("main", 1, { chair: 10, table: 0 }), wh("east", 2, { chair: 0, table: 4 })],
    });
    expect(plan.trace).toHaveLength(2);
    expect(plan.trace[0].reason).toContain("largest remaining share");
    expect(plan.trace.reduce((s, t) => s + t.coveredUnits, 0)).toBe(14);
  });
});

describe("fulfilment planner — backorders", () => {
  it("backorders the shortfall when total stock is insufficient", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 10, 100_000)],
      warehouses: [wh("main", 1, { chair: 4 })],
    });
    expect(plan.hasBackorder).toBe(true);
    expect(plan.backorderUnits).toBe(6);
    const shipped = plan.allocations.find((a) => !a.isBackorder)!;
    expect(shipped.quantity).toBe(4);
  });

  it("does not count a backorder as a shipment", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 10, 100_000)],
      warehouses: [wh("main", 1, { chair: 4 })],
    });
    expect(plan.shipmentCount).toBe(1);
    expect(plan.totalShippingCost).toBe(1);
  });

  it("reports an unfulfillable order rather than throwing", () => {
    const plan = planFulfillment({
      lines: [demand("L1", "chair", 5, 50_000)],
      warehouses: [wh("main", 1, { table: 100 })],
    });
    expect(plan.strategy).toBe("UNFULFILLABLE");
    expect(plan.shipmentCount).toBe(0);
    expect(plan.backorderUnits).toBe(5);
  });

  it("handles having no warehouses at all", () => {
    const plan = planFulfillment({ lines: [demand("L1", "chair", 5, 50_000)], warehouses: [] });
    expect(plan.strategy).toBe("UNFULFILLABLE");
    expect(plan.allocations.every((a) => a.isBackorder)).toBe(true);
  });

  it("returns an empty plan for an empty order", () => {
    const plan = planFulfillment({ lines: [], warehouses: [wh("main", 1, { chair: 10 })] });
    expect(plan.allocations).toEqual([]);
    expect(plan.shipmentCount).toBe(0);
  });
});

describe("fulfilment planner — backorder consolidation", () => {
  const backorders = [
    { lineId: "L1", productId: "chair", productName: "chair", warehouseId: null, warehouseName: null, quantity: 6, isBackorder: true },
    { lineId: "L2", productId: "table", productName: "table", warehouseId: null, warehouseName: null, quantity: 2, isBackorder: true },
  ];

  it("offers consolidation once one warehouse can cover every backordered line", () => {
    const found = findConsolidationOpportunity(backorders, [wh("restocked", 1, { chair: 10, table: 5 })]);
    expect(found).not.toBeNull();
    expect(found!.warehouseId).toBe("restocked");
    expect(found!.lineIds).toEqual(["L1", "L2"]);
  });

  it("does not offer consolidation when no single warehouse covers everything", () => {
    const found = findConsolidationOpportunity(backorders, [
      wh("a", 1, { chair: 10, table: 0 }),
      wh("b", 1, { chair: 0, table: 5 }),
    ]);
    expect(found).toBeNull();
  });

  it("returns null when nothing is backordered", () => {
    expect(findConsolidationOpportunity([], [wh("a", 1, { chair: 10 })])).toBeNull();
  });

  it("prefers the cheapest warehouse able to consolidate", () => {
    const found = findConsolidationOpportunity(backorders, [
      wh("far", 8, { chair: 10, table: 5 }),
      wh("near", 2, { chair: 10, table: 5 }),
    ]);
    expect(found!.warehouseId).toBe("near");
  });
});
