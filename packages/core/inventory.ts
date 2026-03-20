// ─── Stock Position Engine ───────────────────────────────────────────────────
// Pure functions that compute effective available stock and evaluate thresholds.
// Runs both server-side (authoritative) and client-side (preview).

// ─── Types ───────────────────────────────────────────────────────────────────

export type StockStatus = 'healthy' | 'warning' | 'critical';

export interface StockPosition {
  qty_on_hand: number;
  committed_qty: number;
  pending_qty: number;
  net_available: number;
  effective_available: number;
  status: StockStatus;
  reorder_point: number;
  safety_stock: number;
  reorder_qty: number;
  lead_time_days: number;
  days_of_stock: number | null;
}

export interface StockCheckResult {
  allowed: boolean;
  position: StockPosition;
  projected_effective: number;
  projected_status: StockStatus;
  warning: string | null;
  block_reason: string | null;
}

/**
 * Input fields required from a product to compute stock position.
 * These correspond to inventory fields on ProductProperties.
 */
export interface InventoryProductInput {
  qty_on_hand: number;
  reorder_point: number;
  safety_stock: number;
  reorder_qty: number;
  lead_time_days: number;
  pending_order_weight: number;
  avg_daily_usage: number;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Evaluate stock status based on effective available quantity and thresholds.
 *
 * - healthy:  effective > reorder_point
 * - warning:  effective > safety_stock (but <= reorder_point)
 * - critical: effective <= safety_stock
 */
function evaluateStockStatus(
  effectiveAvailable: number,
  reorderPoint: number,
  safetyStock: number,
): StockStatus {
  if (effectiveAvailable > reorderPoint) return 'healthy';
  if (effectiveAvailable > safetyStock) return 'warning';
  return 'critical';
}

/**
 * Compute the number of days of stock remaining based on effective available
 * quantity and average daily usage.
 *
 * Returns null when avgDailyUsage is 0 (cannot compute).
 */
export function computeDaysOfStock(
  effectiveAvailable: number,
  avgDailyUsage: number,
): number | null {
  if (avgDailyUsage === 0) return null;
  return effectiveAvailable / avgDailyUsage;
}

/**
 * Compute the current stock position for a product.
 *
 * - net_available = qty_on_hand - committed_qty
 * - effective_available = qty_on_hand - committed_qty - (pending_qty * pending_order_weight)
 *
 * @param product - Inventory fields from the product
 * @param confirmedQty - Total quantity from confirmed orders (committed)
 * @param draftQty - Total quantity from draft orders (pending)
 */
export function computeStockPosition(
  product: InventoryProductInput,
  confirmedQty: number,
  draftQty: number,
): StockPosition {
  const {
    qty_on_hand,
    reorder_point,
    safety_stock,
    reorder_qty,
    lead_time_days,
    pending_order_weight,
    avg_daily_usage,
  } = product;

  const committed_qty = confirmedQty;
  const pending_qty = draftQty;
  const net_available = qty_on_hand - committed_qty;
  const effective_available = qty_on_hand - committed_qty - pending_qty * pending_order_weight;
  const status = evaluateStockStatus(effective_available, reorder_point, safety_stock);
  const days_of_stock = computeDaysOfStock(effective_available, avg_daily_usage);

  return {
    qty_on_hand,
    committed_qty,
    pending_qty,
    net_available,
    effective_available,
    status,
    reorder_point,
    safety_stock,
    reorder_qty,
    lead_time_days,
    days_of_stock,
  };
}

/**
 * Prospective stock check: what would the stock position be after adding
 * a new order as a draft?
 *
 * - Blocked if projected_effective <= safety_stock
 * - Warning if projected_effective <= reorder_point (but still allowed)
 *
 * @param product - Inventory fields from the product
 * @param confirmedQty - Current total confirmed order quantity
 * @param draftQty - Current total draft order quantity
 * @param newOrderQty - Quantity of the prospective new draft order
 */
export function checkOrderStock(
  product: InventoryProductInput,
  confirmedQty: number,
  draftQty: number,
  newOrderQty: number,
): StockCheckResult {
  // Current position (before the new order)
  const position = computeStockPosition(product, confirmedQty, draftQty);

  // Projected position with the new order added as a draft
  const projectedDraftQty = draftQty + newOrderQty;
  const projected_effective =
    product.qty_on_hand -
    confirmedQty -
    projectedDraftQty * product.pending_order_weight;
  const projected_status = evaluateStockStatus(
    projected_effective,
    product.reorder_point,
    product.safety_stock,
  );

  const blocked = projected_effective <= product.safety_stock;
  const warn = !blocked && projected_effective <= product.reorder_point;

  return {
    allowed: !blocked,
    position,
    projected_effective,
    projected_status,
    warning: warn ? 'Projected stock at or below reorder point' : null,
    block_reason: blocked ? 'Projected stock at or below safety stock level' : null,
  };
}
