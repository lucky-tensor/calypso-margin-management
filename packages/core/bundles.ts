import type { Product } from './types';
import { convertUnits, calculateCost } from './conversions';

export interface Bundle {
  product: Product;
  quantity: number;
  totalSqft: number;
  totalLinft: number;
  overage: number;
  costTotal: number;
  pricePerSqft: number;
  pricePerLinft: number;
}

export interface BundleOpts {
  maxProducts?: number;
  maxBundles?: number;
}

const DEFAULT_MAX_PRODUCTS = 50;
const DEFAULT_MAX_BUNDLES = 20;

function buildBundle(product: Product, quantity: number, overageSqft: number): Bundle {
  const conversions = convertUnits(product, quantity, 'each');
  const costTotal = calculateCost(product, conversions);
  const totalSqft = conversions.square_feet;
  const totalLinft = conversions.linear_feet;

  return {
    product,
    quantity,
    totalSqft,
    totalLinft,
    overage: overageSqft,
    costTotal,
    pricePerSqft: totalSqft === 0 ? 0 : costTotal / totalSqft,
    pricePerLinft: totalLinft === 0 ? 0 : costTotal / totalLinft,
  };
}

/**
 * Find bundle options for a given width and total length requirement.
 *
 * Filters products by exact width match, then for each matching product
 * calculates the number of whole units needed to cover the requested
 * total length. Returns bundles sorted by costTotal ascending.
 */
export function findBundlesByWidth(
  products: Product[],
  widthInches: number,
  totalLengthInches: number,
  opts?: BundleOpts,
): Bundle[] {
  const maxProducts = opts?.maxProducts ?? DEFAULT_MAX_PRODUCTS;
  const maxBundles = opts?.maxBundles ?? DEFAULT_MAX_BUNDLES;

  const eligible = products
    .slice(0, maxProducts)
    .filter((p) => p.properties.width_inches === widthInches);

  const requestedSqft = (widthInches * totalLengthInches) / 144;

  const bundles: Bundle[] = eligible.map((product) => {
    const { length_inches } = product.properties;
    const quantity = Math.ceil(totalLengthInches / length_inches);
    const conversions = convertUnits(product, quantity, 'each');
    const overage = conversions.square_feet - requestedSqft;
    return buildBundle(product, quantity, overage);
  });

  bundles.sort((a, b) => a.costTotal - b.costTotal);

  return bundles.slice(0, maxBundles);
}

/**
 * Find bundle options to meet or exceed a requested square footage.
 *
 * For each product in the catalog, calculates the number of whole units
 * needed to cover the requested sqft. Returns bundles sorted by
 * costTotal ascending.
 */
export function findBundlesBySqft(
  products: Product[],
  totalSqft: number,
  opts?: BundleOpts,
): Bundle[] {
  const maxProducts = opts?.maxProducts ?? DEFAULT_MAX_PRODUCTS;
  const maxBundles = opts?.maxBundles ?? DEFAULT_MAX_BUNDLES;

  const eligible = products.slice(0, maxProducts);

  const bundles: Bundle[] = eligible.map((product) => {
    const { width_inches, length_inches } = product.properties;
    const sqftPerEach = (width_inches * length_inches) / 144;
    const quantity = Math.ceil(totalSqft / sqftPerEach);
    const conversions = convertUnits(product, quantity, 'each');
    const overage = conversions.square_feet - totalSqft;
    return buildBundle(product, quantity, overage);
  });

  bundles.sort((a, b) => a.costTotal - b.costTotal);

  return bundles.slice(0, maxBundles);
}
