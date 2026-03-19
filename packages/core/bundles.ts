import type { Product } from './types';
import { convertUnits, calculateCost } from './conversions';

export interface BundleItem {
  product: Product;
  quantity: number;
}

export interface Bundle {
  items: BundleItem[];
  totalSqft: number;
  totalLinft: number;
  overage: number;
  overageUnit: 'linft' | 'sqft';
  costTotal: number;
  pricePerSqft: number;
  pricePerLinft: number;
}

export interface BundleOpts {
  maxProducts?: number;
  maxBundles?: number;
  maxDepth?: number;
  maxIterations?: number;
}

const DEFAULT_MAX_PRODUCTS = 50;
const DEFAULT_MAX_BUNDLES = 20;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_ITERATIONS = 10_000;

function computeBundleTotals(items: BundleItem[]): {
  totalSqft: number;
  totalLinft: number;
  costTotal: number;
} {
  let totalSqft = 0;
  let totalLinft = 0;
  let costTotal = 0;

  for (const { product, quantity } of items) {
    const conversions = convertUnits(product, quantity, 'each');
    totalSqft += conversions.square_feet;
    totalLinft += conversions.linear_feet;
    costTotal += calculateCost(product, conversions);
  }

  return { totalSqft, totalLinft, costTotal };
}

function buildBundleFromItems(
  items: BundleItem[],
  overage: number,
  overageUnit: 'linft' | 'sqft',
): Bundle {
  const { totalSqft, totalLinft, costTotal } = computeBundleTotals(items);

  return {
    items,
    totalSqft,
    totalLinft,
    overage,
    overageUnit,
    costTotal,
    pricePerSqft: totalSqft === 0 ? 0 : costTotal / totalSqft,
    pricePerLinft: totalLinft === 0 ? 0 : costTotal / totalLinft,
  };
}

/** Canonical key for a set of products (order-independent, quantity-independent). */
function productSetKey(products: Product[]): string {
  return products
    .map((p) => p.id)
    .sort()
    .join('|');
}

/** Returns true if bundle a is strictly better than bundle b. */
function isBetter(a: Bundle, b: Bundle): boolean {
  if (a.overage < b.overage) return true;
  if (a.overage === b.overage && a.costTotal < b.costTotal) return true;
  return false;
}

/**
 * Get the unit delivered per "each" for the given targetUnit.
 * targetUnit 'linft' → length_inches / 12
 * targetUnit 'sqft'  → (width_inches * length_inches) / 144
 */
function unitDelivered(product: Product, targetUnit: 'linft' | 'sqft'): number {
  const { width_inches, length_inches } = product.properties;
  if (targetUnit === 'linft') {
    return length_inches / 12;
  }
  return (width_inches * length_inches) / 144;
}

/**
 * Compute the overage for a given set of items against the target.
 */
function computeOverage(items: BundleItem[], target: number, targetUnit: 'linft' | 'sqft'): number {
  let total = 0;
  for (const { product, quantity } of items) {
    total += quantity * unitDelivered(product, targetUnit);
  }
  return total - target;
}

/**
 * Build a Bundle from products + quantities, computing overage for the given target.
 */
function buildBundle(
  products: Product[],
  quantities: number[],
  target: number,
  targetUnit: 'linft' | 'sqft',
): Bundle {
  const items: BundleItem[] = products.map((p, i) => ({ product: p, quantity: quantities[i] }));
  const overage = computeOverage(items, target, targetUnit);
  return buildBundleFromItems(items, overage, targetUnit);
}

/**
 * Find the best integer quantities for a set of products to meet the target
 * with minimum overage (tiebroken by minimum costTotal).
 *
 * N=1: qty = ceil(target / unit(P))
 * N=2: iterate q_A from 0..ceil(target/unit(A)), derive q_B to cover remainder
 * N≥3: fix all but last at their single-product-minimum quantities, optimize last
 */
function findBestQuantities(
  products: Product[],
  target: number,
  targetUnit: 'linft' | 'sqft',
): Bundle | null {
  const n = products.length;
  if (n === 0) return null;

  const units = products.map((p) => unitDelivered(p, targetUnit));

  // Guard: skip products with zero unit delivered
  if (units.some((u) => u <= 0)) return null;

  if (n === 1) {
    const qty = Math.ceil(target / units[0]);
    return buildBundle(products, [qty], target, targetUnit);
  }

  if (n === 2) {
    const unitA = units[0];
    const unitB = units[1];
    const maxQA = Math.ceil(target / unitA);

    let bestBundle: Bundle | null = null;

    for (let qA = 0; qA <= maxQA; qA++) {
      const remaining = target - qA * unitA;
      const qB = remaining <= 0 ? 0 : Math.ceil(remaining / unitB);

      // Skip if both are 0 (no products in bundle)
      if (qA === 0 && qB === 0) continue;

      const candidate = buildBundle(products, [qA, qB], target, targetUnit);
      if (bestBundle === null || isBetter(candidate, bestBundle)) {
        bestBundle = candidate;
      }
    }

    return bestBundle;
  }

  // N≥3: fix all but last at their single-product minimums, optimize last
  const fixedQtys = products.slice(0, n - 1).map((_, i) => Math.ceil(target / units[i]));
  const lastUnit = units[n - 1];

  // Compute how much the fixed products cover
  let fixedTotal = 0;
  for (let i = 0; i < n - 1; i++) {
    fixedTotal += fixedQtys[i] * units[i];
  }

  // Remaining gap for last product (may already be covered or over)
  const remaining = target - fixedTotal;
  const qLast = remaining <= 0 ? 0 : Math.ceil(remaining / lastUnit);

  const allQtys = [...fixedQtys, qLast];
  return buildBundle(products, allQtys, target, targetUnit);
}

/**
 * Core bundle-finding algorithm.
 *
 * Maintains exactly one bundle per unique product-type set.
 * Expands iteratively by adding one new product type per round.
 * Sorts by overage asc, then costTotal asc.
 */
function findBundles(
  eligible: Product[],
  target: number,
  targetUnit: 'linft' | 'sqft',
  maxDepth: number,
  maxBundles: number,
  maxIterations: number,
): Bundle[] {
  // Map from sortedProductIds key → best bundle for that product-type set
  const bundles = new Map<string, Bundle>();

  // Round 0: single-product bundles
  for (const product of eligible) {
    const unit = unitDelivered(product, targetUnit);
    if (unit <= 0) continue;
    const qty = Math.ceil(target / unit);
    const bundle = buildBundle([product], [qty], target, targetUnit);
    bundles.set(productSetKey([product]), bundle);
  }

  // Rounds 1..maxDepth-1: expand by adding one product type per round
  let iterationCount = 0;
  let hitLimit = false;

  for (let round = 1; round <= maxDepth - 1 && !hitLimit; round++) {
    const prevBundles = Array.from(bundles.values());
    let anyImprovement = false;

    outer: for (const existingBundle of prevBundles) {
      const existingProducts = existingBundle.items.map((i) => i.product);
      const existingIds = new Set(existingProducts.map((p) => p.id));

      for (const product of eligible) {
        if (existingIds.has(product.id)) continue;

        if (iterationCount++ >= maxIterations) {
          hitLimit = true;
          break outer;
        }

        const newProducts = [...existingProducts, product];
        const bestBundle = findBestQuantities(newProducts, target, targetUnit);
        if (bestBundle === null) continue;

        const key = productSetKey(newProducts);
        const existing = bundles.get(key);
        if (!existing || isBetter(bestBundle, existing)) {
          bundles.set(key, bestBundle);
          anyImprovement = true;
        }
      }
    }

    if (!anyImprovement) break;
  }

  return Array.from(bundles.values())
    .sort((a, b) => a.overage - b.overage || a.costTotal - b.costTotal)
    .slice(0, maxBundles);
}

/**
 * Find bundle options for a given width and total length requirement.
 *
 * Filters products by exact width match, then generates single-product and
 * multi-product combinations to cover the requested total length.
 * Returns bundles sorted by overage asc, then costTotal asc.
 */
export function findBundlesByWidth(
  products: Product[],
  widthInches: number,
  totalLengthInches: number,
  opts?: BundleOpts,
): Bundle[] {
  const maxProducts = opts?.maxProducts ?? DEFAULT_MAX_PRODUCTS;
  const maxBundles = opts?.maxBundles ?? DEFAULT_MAX_BUNDLES;
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxIterations = opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const eligible = products
    .slice(0, maxProducts)
    .filter((p) => p.properties.width_inches === widthInches);

  const targetLinft = totalLengthInches / 12;

  return findBundles(eligible, targetLinft, 'linft', maxDepth, maxBundles, maxIterations);
}

/**
 * Find bundle options to meet or exceed a requested square footage.
 *
 * All products are eligible regardless of width. Generates single-product
 * and multi-product combinations. Returns bundles sorted by overage asc, then costTotal asc.
 */
export function findBundlesBySqft(
  products: Product[],
  totalSqft: number,
  opts?: BundleOpts,
): Bundle[] {
  const maxProducts = opts?.maxProducts ?? DEFAULT_MAX_PRODUCTS;
  const maxBundles = opts?.maxBundles ?? DEFAULT_MAX_BUNDLES;
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxIterations = opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const eligible = products.slice(0, maxProducts);

  return findBundles(eligible, totalSqft, 'sqft', maxDepth, maxBundles, maxIterations);
}
