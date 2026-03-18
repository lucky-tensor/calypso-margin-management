import type {
  Product,
  UnitOfMeasure,
  UnitConversions,
  MarginResult,
} from './types';

/**
 * Convert a quantity in any unit to all three units (eaches, linear_feet, square_feet).
 *
 * Formulas (PRD Section 5):
 *   1 each = (length_inches / 12) linear feet
 *   1 each = (width_inches * length_inches) / 144 square feet
 */
export function convertUnits(
  product: Product,
  quantity: number,
  fromUnit: UnitOfMeasure,
): UnitConversions {
  const { width_inches, length_inches } = product.properties;

  // Conversion factors relative to one each
  const linftPerEach = length_inches / 12;
  const sqftPerEach = (width_inches * length_inches) / 144;

  let eaches: number;

  switch (fromUnit) {
    case 'each':
      eaches = quantity;
      break;
    case 'linear_foot':
      eaches = quantity / linftPerEach;
      break;
    case 'square_foot':
      eaches = quantity / sqftPerEach;
      break;
  }

  return {
    eaches,
    linear_feet: eaches * linftPerEach,
    square_feet: eaches * sqftPerEach,
  };
}

/**
 * Calculate total cost using the product's primary_cost_basis and the
 * corresponding converted quantity.
 */
export function calculateCost(
  product: Product,
  conversions: UnitConversions,
): number {
  const { primary_cost_basis, cost_per_each, cost_per_linft, cost_per_sqft } =
    product.properties;

  switch (primary_cost_basis) {
    case 'each':
      return (cost_per_each ?? 0) * conversions.eaches;
    case 'linear_foot':
      return (cost_per_linft ?? 0) * conversions.linear_feet;
    case 'square_foot':
      return (cost_per_sqft ?? 0) * conversions.square_feet;
  }
}

/**
 * Calculate margin dollars and percent from revenue and cost.
 * Returns percent = 0 when revenue is 0 to avoid division by zero.
 */
export function calculateMargin(revenue: number, cost: number): MarginResult {
  const dollars = revenue - cost;
  const percent = revenue === 0 ? 0 : (dollars / revenue) * 100;
  return { dollars, percent };
}

/**
 * Evaluate margin health against product thresholds.
 *
 * healthy  : percent >= target
 * warning  : floor <= percent < target
 * critical : percent < floor
 */
export function evaluateMargin(
  percent: number,
  target: number,
  floor: number,
): 'healthy' | 'warning' | 'critical' {
  if (percent >= target) return 'healthy';
  if (percent >= floor) return 'warning';
  return 'critical';
}

export interface ComputedOrderFields {
  qty_eaches: number;
  qty_linft: number;
  qty_sqft: number;
  total_revenue: number;
  total_cost: number;
  margin_dollars: number;
  margin_percent: number;
}

/**
 * Orchestrates conversion → cost → margin in a single call.
 * Used by both the server (authoritative) and the client (live preview).
 */
export function computeOrderFields(
  product: Product,
  quantity: number,
  unit: UnitOfMeasure,
  sellPricePerUnit: number,
): ComputedOrderFields {
  const conversions = convertUnits(product, quantity, unit);
  const total_revenue = quantity * sellPricePerUnit;
  const total_cost = calculateCost(product, conversions);
  const { dollars: margin_dollars, percent: margin_percent } = calculateMargin(
    total_revenue,
    total_cost,
  );

  return {
    qty_eaches: conversions.eaches,
    qty_linft: conversions.linear_feet,
    qty_sqft: conversions.square_feet,
    total_revenue,
    total_cost,
    margin_dollars,
    margin_percent,
  };
}
