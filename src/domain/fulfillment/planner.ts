import type {
  Allocation,
  DemandLine,
  FulfillmentInput,
  FulfillmentPlan,
  PlanStep,
  WarehouseStock,
} from "./types";

/**
 * Multi-warehouse fulfilment planner
 * ==================================
 *
 * Goal: satisfy every order line while sending as few shipments as possible, because
 * shipment count — not units shipped — is what actually costs money and annoys customers.
 *
 * Choosing the minimum set of warehouses that covers all demand is exactly the
 * **set cover problem**, which is NP-hard. Brute force is O(2^W) and would be fine at
 * hackathon data sizes, but it degrades badly the moment a real business has 30 depots.
 * So this uses the standard **greedy approximation**: repeatedly pick the warehouse that
 * covers the most still-unmet demand, tie-breaking on the cheaper shipping weight.
 * Greedy is the best known polynomial approximation for set cover (within a ln(n) factor
 * of optimal) and runs in O(W x L) per iteration, which is instant at any realistic size.
 *
 * Before the greedy loop runs, there is a fast path: if any single warehouse can cover
 * the entire order, take it immediately. That is both the optimal answer and the common
 * case, and it avoids paying for the general algorithm on an easy input.
 *
 * "Most demand" is measured in **value**, not units, so the planner prioritises getting
 * the expensive items out of one place rather than optimising for a box of cheap screws.
 *
 * Pure function: no database, no clock. The caller supplies a stock snapshot and gets a
 * plan plus a trace explaining every decision.
 */
export function planFulfillment(input: FulfillmentInput): FulfillmentPlan {
  const { lines, warehouses } = input;

  if (lines.length === 0) {
    return emptyPlan();
  }

  // Mutable copy of stock — the planner consumes it as it allocates.
  const stock = new Map<string, Map<string, number>>();
  for (const w of warehouses) {
    stock.set(w.warehouseId, new Map(Object.entries(w.available)));
  }

  // ── Fast path: can one warehouse ship everything? ──────────────────────────
  // This is both optimal and the common case, so it is worth checking first.
  const soleCandidates = warehouses
    .filter((w) => coversEntireOrder(w, lines))
    .sort((a, b) => a.shippingCostWeight - b.shippingCostWeight);

  if (soleCandidates.length > 0) {
    const chosen = soleCandidates[0];
    return {
      allocations: lines.map((l) => ({
        lineId: l.lineId,
        productId: l.productId,
        productName: l.productName,
        warehouseId: chosen.warehouseId,
        warehouseName: chosen.warehouseName,
        quantity: l.quantity,
        isBackorder: false,
      })),
      shipmentCount: 1,
      totalShippingCost: chosen.shippingCostWeight,
      isSingleShipment: true,
      hasBackorder: false,
      backorderUnits: 0,
      trace: [
        {
          warehouseId: chosen.warehouseId,
          warehouseName: chosen.warehouseName,
          coveredValuePaise: lines.reduce((s, l) => s + l.valuePaise, 0),
          coveredUnits: lines.reduce((s, l) => s + l.quantity, 0),
          shippingCostWeight: chosen.shippingCostWeight,
          reason: `${chosen.warehouseName} holds enough stock for every line, so the whole order ships as one delivery.`,
        },
      ],
      strategy: "SINGLE_WAREHOUSE",
    };
  }

  // ── Greedy set cover ───────────────────────────────────────────────────────
  const remaining = new Map<string, number>(lines.map((l) => [l.lineId, l.quantity]));
  const allocations: Allocation[] = [];
  const trace: PlanStep[] = [];
  const usedWarehouses = new Set<string>();
  let totalShippingCost = 0;

  // Value per unit, so partial coverage can be valued proportionally.
  const unitValue = new Map<string, number>(
    lines.map((l) => [l.lineId, l.quantity === 0 ? 0 : l.valuePaise / l.quantity]),
  );

  while ([...remaining.values()].some((q) => q > 0)) {
    let best: { w: WarehouseStock; value: number; units: number } | null = null;

    for (const w of warehouses) {
      if (usedWarehouses.has(w.warehouseId)) continue;
      const wStock = stock.get(w.warehouseId)!;

      let value = 0;
      let units = 0;
      for (const line of lines) {
        const need = remaining.get(line.lineId) ?? 0;
        if (need <= 0) continue;
        const canTake = Math.min(need, wStock.get(line.productId) ?? 0);
        if (canTake > 0) {
          units += canTake;
          value += canTake * (unitValue.get(line.lineId) ?? 0);
        }
      }

      if (units === 0) continue;

      // Prefer more covered value; break ties on the cheaper warehouse.
      const better =
        best === null ||
        value > best.value ||
        (value === best.value && w.shippingCostWeight < best.w.shippingCostWeight);

      if (better) best = { w, value, units };
    }

    // No remaining warehouse can contribute anything — the rest is backordered.
    if (best === null) break;

    const wStock = stock.get(best.w.warehouseId)!;
    for (const line of lines) {
      const need = remaining.get(line.lineId) ?? 0;
      if (need <= 0) continue;
      const have = wStock.get(line.productId) ?? 0;
      const take = Math.min(need, have);
      if (take <= 0) continue;

      allocations.push({
        lineId: line.lineId,
        productId: line.productId,
        productName: line.productName,
        warehouseId: best.w.warehouseId,
        warehouseName: best.w.warehouseName,
        quantity: take,
        isBackorder: false,
      });
      wStock.set(line.productId, have - take);
      remaining.set(line.lineId, need - take);
    }

    usedWarehouses.add(best.w.warehouseId);
    totalShippingCost += best.w.shippingCostWeight;
    trace.push({
      warehouseId: best.w.warehouseId,
      warehouseName: best.w.warehouseName,
      coveredValuePaise: Math.round(best.value),
      coveredUnits: best.units,
      shippingCostWeight: best.w.shippingCostWeight,
      reason: `${best.w.warehouseName} covers the largest remaining share of order value (${best.units} units), so it is added to the split next.`,
    });
  }

  // ── Whatever is still unmet becomes a backorder ────────────────────────────
  let backorderUnits = 0;
  for (const line of lines) {
    const short = remaining.get(line.lineId) ?? 0;
    if (short <= 0) continue;
    backorderUnits += short;
    allocations.push({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      warehouseId: null,
      warehouseName: null,
      quantity: short,
      isBackorder: true,
    });
  }

  return {
    allocations,
    shipmentCount: usedWarehouses.size,
    totalShippingCost,
    isSingleShipment: usedWarehouses.size === 1,
    hasBackorder: backorderUnits > 0,
    backorderUnits,
    trace,
    strategy: usedWarehouses.size === 0 ? "UNFULFILLABLE" : "GREEDY_SPLIT",
  };
}

/**
 * When delayed stock arrives, this reports which backordered allocations can now be
 * filled from a single warehouse — the trigger for the "Consolidate Remaining Backorder"
 * prompt the spec asks for, so a customer gets one follow-up parcel rather than several.
 */
export function findConsolidationOpportunity(
  backorders: readonly Allocation[],
  warehouses: readonly WarehouseStock[],
): { warehouseId: string; warehouseName: string; lineIds: string[] } | null {
  const pending = backorders.filter((a) => a.isBackorder && a.quantity > 0);
  if (pending.length === 0) return null;

  const candidates = warehouses
    .filter((w) => pending.every((b) => (w.available[b.productId] ?? 0) >= b.quantity))
    .sort((a, b) => a.shippingCostWeight - b.shippingCostWeight);

  if (candidates.length === 0) return null;
  const w = candidates[0];
  return {
    warehouseId: w.warehouseId,
    warehouseName: w.warehouseName,
    lineIds: [...new Set(pending.map((b) => b.lineId))],
  };
}

function coversEntireOrder(w: WarehouseStock, lines: readonly DemandLine[]): boolean {
  // Aggregate demand per product first: two lines may reference the same product.
  const needed = new Map<string, number>();
  for (const l of lines) {
    needed.set(l.productId, (needed.get(l.productId) ?? 0) + l.quantity);
  }
  for (const [productId, qty] of needed) {
    if ((w.available[productId] ?? 0) < qty) return false;
  }
  return true;
}

function emptyPlan(): FulfillmentPlan {
  return {
    allocations: [],
    shipmentCount: 0,
    totalShippingCost: 0,
    isSingleShipment: false,
    hasBackorder: false,
    backorderUnits: 0,
    trace: [],
    strategy: "UNFULFILLABLE",
  };
}
