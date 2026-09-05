/** Inputs and outputs for the multi-warehouse fulfilment planner. */

export interface WarehouseStock {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  /**
   * Relative cost of dispatching a shipment from this warehouse. Used to break ties
   * between warehouses that can satisfy the same demand, and to price the final plan.
   */
  shippingCostWeight: number;
  /** Available quantity per product id. */
  available: Readonly<Record<string, number>>;
}

export interface DemandLine {
  lineId: string;
  productId: string;
  productName: string;
  quantity: number;
  /** Line value in paise. Used to prioritise covering high-value demand first. */
  valuePaise: number;
}

export interface FulfillmentInput {
  lines: readonly DemandLine[];
  warehouses: readonly WarehouseStock[];
}

export interface Allocation {
  lineId: string;
  productId: string;
  productName: string;
  /** Null when the quantity could not be sourced anywhere — it becomes a backorder. */
  warehouseId: string | null;
  warehouseName: string | null;
  quantity: number;
  isBackorder: boolean;
}

export interface PlanStep {
  /** Which warehouse the greedy loop selected on this iteration, and why. */
  warehouseId: string;
  warehouseName: string;
  coveredValuePaise: number;
  coveredUnits: number;
  shippingCostWeight: number;
  reason: string;
}

export interface FulfillmentPlan {
  allocations: Allocation[];
  /** Distinct warehouses actually shipping. Backorders do not count as a shipment. */
  shipmentCount: number;
  totalShippingCost: number;
  /** True when one warehouse covered the entire order — the ideal outcome. */
  isSingleShipment: boolean;
  hasBackorder: boolean;
  backorderUnits: number;
  /** Ordered record of how the planner reached this split, rendered in the UI. */
  trace: PlanStep[];
  strategy: "SINGLE_WAREHOUSE" | "GREEDY_SPLIT" | "UNFULFILLABLE";
}
