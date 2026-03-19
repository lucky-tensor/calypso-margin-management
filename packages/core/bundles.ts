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

/**
 * Deduplicate bundles by their items signature.
 * Two bundles are considered the same if they have the same products and quantities (order-independent).
 */
function bundleKey(items: BundleItem[]): string {
  return items
    .map((i) => `${i.product.id}:${i.quantity}`)
    .sort()
    .join('|');
}

/**
 * Find bundle options for a given width and total length requirement.
 *
 * Filters products by exact width match, then generates single-product and
 * multi-product combinations to cover the requested total length.
 * Returns bundles sorted by costTotal ascending.
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

  const seen = new Set<string>();
  const candidates: Bundle[] = [];
  let iterations = 0;

  function addBundle(items: BundleItem[], overageLinft: number): void {
    const key = bundleKey(items);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(buildBundleFromItems(items, overageLinft, 'linft'));
    }
  }

  // Single-product bundles
  for (const product of eligible) {
    const { length_inches } = product.properties;
    const linftPerEach = length_inches / 12;
    const quantity = Math.ceil(totalLengthInches / length_inches);
    const totalLinft = quantity * linftPerEach;
    const overage = totalLinft - targetLinft;
    addBundle([{ product, quantity }], overage);
  }

  if (eligible.length < 2 || maxDepth < 2) {
    candidates.sort((a, b) => a.costTotal - b.costTotal);
    return candidates.slice(0, maxBundles);
  }

  // Multi-product combinations — iterative DFS up to maxDepth
  // We enumerate combinations of products (with repetition for quantity)
  // by building up item lists recursively.
  // Strategy: for each subset of distinct products (size 2..maxDepth),
  // find the optimal quantities by fixing counts of all but the last product
  // and computing the last product's count to cover the remaining length.

  function searchCombinations(
    productSubset: Product[],
    depth: number,
    currentItems: BundleItem[],
    remainingLinft: number,
  ): void {
    if (iterations >= maxIterations) return;

    if (depth === productSubset.length - 1) {
      // Last product: compute quantity to cover remaining
      const lastProduct = productSubset[depth];
      const linftPerEach = lastProduct.properties.length_inches / 12;
      if (linftPerEach <= 0) return;

      iterations++;

      if (remainingLinft <= 0) {
        // Already covered; add 0 of the last product (omit it)
        // But we need at least 1 of the last to justify including it
        return;
      }

      const qty = Math.ceil(remainingLinft / linftPerEach);
      if (qty <= 0) return;

      const totalLinft =
        currentItems.reduce(
          (sum, i) => sum + i.quantity * (i.product.properties.length_inches / 12),
          0,
        ) +
        qty * linftPerEach;
      const overage = totalLinft - targetLinft;

      addBundle([...currentItems, { product: lastProduct, quantity: qty }], overage);
      return;
    }

    // For earlier products, try quantities from 0 up to ceil(remainingLinft / linftPerEach)
    const product = productSubset[depth];
    const linftPerEach = product.properties.length_inches / 12;
    if (linftPerEach <= 0) return;

    const maxQty = Math.ceil(remainingLinft / linftPerEach);

    for (let qty = 1; qty <= maxQty; qty++) {
      if (iterations >= maxIterations) return;
      const newRemainingLinft = remainingLinft - qty * linftPerEach;
      searchCombinations(
        productSubset,
        depth + 1,
        [...currentItems, { product, quantity: qty }],
        newRemainingLinft,
      );
    }
  }

  // Generate subsets of eligible products of size 2..maxDepth
  function generateSubsets(arr: Product[], minSize: number, maxSize: number): Product[][] {
    const result: Product[][] = [];

    function helper(start: number, current: Product[]): void {
      if (current.length >= minSize) {
        result.push([...current]);
      }
      if (current.length >= maxSize) return;
      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        helper(i + 1, current);
        current.pop();
      }
    }

    helper(0, []);
    return result;
  }

  const subsets = generateSubsets(eligible, 2, maxDepth);

  for (const subset of subsets) {
    if (iterations >= maxIterations) break;
    searchCombinations(subset, 0, [], targetLinft);
  }

  candidates.sort((a, b) => a.costTotal - b.costTotal);
  return candidates.slice(0, maxBundles);
}

/**
 * Find bundle options to meet or exceed a requested square footage.
 *
 * All products are eligible regardless of width. Generates single-product
 * and multi-product combinations. Returns bundles sorted by costTotal ascending.
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

  const seen = new Set<string>();
  const candidates: Bundle[] = [];
  let iterations = 0;

  function addBundle(items: BundleItem[], overageSqft: number): void {
    const key = bundleKey(items);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(buildBundleFromItems(items, overageSqft, 'sqft'));
    }
  }

  // Single-product bundles
  for (const product of eligible) {
    const { width_inches, length_inches } = product.properties;
    const sqftPerEach = (width_inches * length_inches) / 144;
    if (sqftPerEach <= 0) continue;
    const quantity = Math.ceil(totalSqft / sqftPerEach);
    const bundleSqft = quantity * sqftPerEach;
    const overage = bundleSqft - totalSqft;
    addBundle([{ product, quantity }], overage);
  }

  if (eligible.length < 2 || maxDepth < 2) {
    candidates.sort((a, b) => a.costTotal - b.costTotal);
    return candidates.slice(0, maxBundles);
  }

  function searchCombinations(
    productSubset: Product[],
    depth: number,
    currentItems: BundleItem[],
    remainingSqft: number,
  ): void {
    if (iterations >= maxIterations) return;

    if (depth === productSubset.length - 1) {
      const lastProduct = productSubset[depth];
      const { width_inches, length_inches } = lastProduct.properties;
      const sqftPerEach = (width_inches * length_inches) / 144;
      if (sqftPerEach <= 0) return;

      iterations++;

      if (remainingSqft <= 0) {
        return;
      }

      const qty = Math.ceil(remainingSqft / sqftPerEach);
      if (qty <= 0) return;

      const totalBundleSqft =
        currentItems.reduce((sum, i) => {
          const { width_inches: w, length_inches: l } = i.product.properties;
          return sum + i.quantity * ((w * l) / 144);
        }, 0) +
        qty * sqftPerEach;
      const overage = totalBundleSqft - totalSqft;

      addBundle([...currentItems, { product: lastProduct, quantity: qty }], overage);
      return;
    }

    const product = productSubset[depth];
    const { width_inches, length_inches } = product.properties;
    const sqftPerEach = (width_inches * length_inches) / 144;
    if (sqftPerEach <= 0) return;

    const maxQty = Math.ceil(remainingSqft / sqftPerEach);

    for (let qty = 1; qty <= maxQty; qty++) {
      if (iterations >= maxIterations) return;
      const newRemaining = remainingSqft - qty * sqftPerEach;
      searchCombinations(
        productSubset,
        depth + 1,
        [...currentItems, { product, quantity: qty }],
        newRemaining,
      );
    }
  }

  function generateSubsets(arr: Product[], minSize: number, maxSize: number): Product[][] {
    const result: Product[][] = [];

    function helper(start: number, current: Product[]): void {
      if (current.length >= minSize) {
        result.push([...current]);
      }
      if (current.length >= maxSize) return;
      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        helper(i + 1, current);
        current.pop();
      }
    }

    helper(0, []);
    return result;
  }

  const subsets = generateSubsets(eligible, 2, maxDepth);

  for (const subset of subsets) {
    if (iterations >= maxIterations) break;
    searchCombinations(subset, 0, [], totalSqft);
  }

  candidates.sort((a, b) => a.costTotal - b.costTotal);
  return candidates.slice(0, maxBundles);
}
