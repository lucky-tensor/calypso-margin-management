import { describe, it, expect } from 'vitest';
import { findBundlesByWidth, findBundlesBySqft } from './bundles';
import type { Product } from './types';

// Helper to create test products
const makeProduct = (id: string, overrides: Partial<Product['properties']> = {}): Product => ({
  id,
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120,
    weight_per_sqft: 0.58,
    cost_per_each: 32.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
    ...overrides,
  },
});

// ─── findBundlesByWidth ────────────────────────────────────────────────────────

describe('findBundlesByWidth', () => {
  it('returns only bundles for products matching the requested width', () => {
    // 3 products: two at 48", one at 60"
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
      makeProduct('p2', { width_inches: 60, length_inches: 120, cost_per_each: 40 }),
      makeProduct('p3', { width_inches: 48, length_inches: 60, cost_per_each: 18 }),
    ];

    // Request 200 linft (2400 inches) at 48" wide
    const result = findBundlesByWidth(products, 48, 2400);

    expect(result).toHaveLength(2);
    expect(result.every((b) => b.product.properties.width_inches === 48)).toBe(true);
  });

  it('calculates correct unit counts for each matching product', () => {
    // p1: 48"x120" — needs ceil(2400/120) = 20 units
    // p3: 48"x60"  — needs ceil(2400/60)  = 40 units
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
      makeProduct('p3', { width_inches: 48, length_inches: 60, cost_per_each: 18 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400);
    const byId = Object.fromEntries(result.map((b) => [b.product.id, b]));

    expect(byId['p1'].quantity).toBe(20);
    expect(byId['p3'].quantity).toBe(40);
  });

  it('calculates totalSqft, totalLinft, and overage correctly', () => {
    // p1: 48"x120", 20 units
    //   totalLinft = 20 * (120/12) = 200 linft
    //   totalSqft  = 20 * (48*120)/144 = 20 * 40 = 800 sqft
    //   requestedSqft = (48 * 2400) / 144 = 800 sqft → overage = 0
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesByWidth(products, 48, 2400);

    expect(bundle.quantity).toBe(20);
    expect(bundle.totalLinft).toBeCloseTo(200, 10);
    expect(bundle.totalSqft).toBeCloseTo(800, 10);
    expect(bundle.overage).toBeCloseTo(0, 10);
  });

  it('calculates non-zero overage when length is not an exact multiple', () => {
    // p1: 48"x120" — request 2500 inches → ceil(2500/120) = ceil(20.83...) = 21 units
    //   totalLinft = 21 * 10 = 210 linft
    //   totalSqft  = 21 * 40 = 840 sqft
    //   requestedSqft = (48 * 2500) / 144 ≈ 833.33 sqft
    //   overage = 840 - 833.33... ≈ 6.67 sqft
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesByWidth(products, 48, 2500);

    expect(bundle.quantity).toBe(21);
    expect(bundle.overage).toBeCloseTo(840 - (48 * 2500) / 144, 6);
  });

  it('returns empty array when no products match the width', () => {
    const products = [
      makeProduct('p1', { width_inches: 60, length_inches: 120 }),
      makeProduct('p2', { width_inches: 72, length_inches: 120 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400);

    expect(result).toEqual([]);
  });

  it('returns empty array for empty product list', () => {
    const result = findBundlesByWidth([], 48, 2400);
    expect(result).toEqual([]);
  });

  it('returns bundles sorted by costTotal ascending', () => {
    const products = [
      makeProduct('expensive', { width_inches: 48, length_inches: 120, cost_per_each: 50 }),
      makeProduct('cheap', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400);

    expect(result[0].product.id).toBe('cheap');
    expect(result[1].product.id).toBe('expensive');
    expect(result[0].costTotal).toBeLessThanOrEqual(result[1].costTotal);
  });

  it('calculates costTotal correctly', () => {
    // p1: 48"x120", primary_cost_basis=each, cost_per_each=32
    // 20 units → costTotal = 20 * 32 = 640
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesByWidth(products, 48, 2400);

    expect(bundle.costTotal).toBeCloseTo(640, 6);
    expect(bundle.pricePerSqft).toBeCloseTo(640 / 800, 6);
    expect(bundle.pricePerLinft).toBeCloseTo(640 / 200, 6);
  });

  it('enforces maxProducts backstop', () => {
    // 5 products all at 48", but maxProducts=3 → only first 3 evaluated
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 10 }),
      makeProduct('p2', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('p3', { width_inches: 48, length_inches: 120, cost_per_each: 30 }),
      makeProduct('p4', { width_inches: 48, length_inches: 120, cost_per_each: 40 }),
      makeProduct('p5', { width_inches: 48, length_inches: 120, cost_per_each: 50 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400, { maxProducts: 3 });

    expect(result).toHaveLength(3);
    expect(result.map((b) => b.product.id)).not.toContain('p4');
    expect(result.map((b) => b.product.id)).not.toContain('p5');
  });

  it('enforces maxBundles backstop — returns only the N cheapest bundles', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 10 }),
      makeProduct('p2', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('p3', { width_inches: 48, length_inches: 120, cost_per_each: 30 }),
      makeProduct('p4', { width_inches: 48, length_inches: 120, cost_per_each: 40 }),
      makeProduct('p5', { width_inches: 48, length_inches: 120, cost_per_each: 50 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400, { maxBundles: 2 });

    expect(result).toHaveLength(2);
    // Should be the two cheapest
    expect(result[0].product.id).toBe('p1');
    expect(result[1].product.id).toBe('p2');
  });

  it('returns overage of 0 when requested length is exact multiple of product length', () => {
    // 48"x120" product, request 2400 inches → exactly 20 rolls, no overage
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesByWidth(products, 48, 2400);

    expect(bundle.overage).toBe(0);
  });
});

// ─── findBundlesBySqft ────────────────────────────────────────────────────────

describe('findBundlesBySqft', () => {
  it('returns one bundle per product in the catalog', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120 }),
      makeProduct('p2', { width_inches: 60, length_inches: 120 }),
      makeProduct('p3', { width_inches: 48, length_inches: 60 }),
      makeProduct('p4', { width_inches: 72, length_inches: 100 }),
      makeProduct('p5', { width_inches: 36, length_inches: 120 }),
    ];

    const result = findBundlesBySqft(products, 500);

    expect(result).toHaveLength(5);
  });

  it('calculates correct quantities and overage for each product', () => {
    // p1: 48"x120" → sqftPerEach = (48*120)/144 = 40 → ceil(500/40) = 13
    //   totalSqft = 13 * 40 = 520, overage = 520 - 500 = 20
    // p2: 60"x120" → sqftPerEach = (60*120)/144 = 50 → ceil(500/50) = 10
    //   totalSqft = 10 * 50 = 500, overage = 0
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
      makeProduct('p2', { width_inches: 60, length_inches: 120, cost_per_each: 40 }),
    ];

    const result = findBundlesBySqft(products, 500);
    const byId = Object.fromEntries(result.map((b) => [b.product.id, b]));

    expect(byId['p1'].quantity).toBe(13);
    expect(byId['p1'].totalSqft).toBeCloseTo(520, 6);
    expect(byId['p1'].overage).toBeCloseTo(20, 6);

    expect(byId['p2'].quantity).toBe(10);
    expect(byId['p2'].totalSqft).toBeCloseTo(500, 6);
    expect(byId['p2'].overage).toBeCloseTo(0, 6);
  });

  it('returns empty array for empty product list', () => {
    const result = findBundlesBySqft([], 500);
    expect(result).toEqual([]);
  });

  it('returns bundles sorted by costTotal ascending', () => {
    const products = [
      makeProduct('expensive', { width_inches: 48, length_inches: 120, cost_per_each: 50 }),
      makeProduct('cheap', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
    ];

    const result = findBundlesBySqft(products, 500);

    expect(result[0].product.id).toBe('cheap');
    expect(result[0].costTotal).toBeLessThanOrEqual(result[1].costTotal);
  });

  it('enforces maxBundles backstop — returns only the N cheapest bundles', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 10 }),
      makeProduct('p2', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('p3', { width_inches: 48, length_inches: 120, cost_per_each: 30 }),
      makeProduct('p4', { width_inches: 48, length_inches: 120, cost_per_each: 40 }),
      makeProduct('p5', { width_inches: 48, length_inches: 120, cost_per_each: 50 }),
    ];

    const result = findBundlesBySqft(products, 500, { maxBundles: 2 });

    expect(result).toHaveLength(2);
    expect(result[0].product.id).toBe('p1');
    expect(result[1].product.id).toBe('p2');
  });

  it('enforces maxProducts backstop', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 10 }),
      makeProduct('p2', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('p3', { width_inches: 48, length_inches: 120, cost_per_each: 30 }),
      makeProduct('p4', { width_inches: 48, length_inches: 120, cost_per_each: 40 }),
      makeProduct('p5', { width_inches: 48, length_inches: 120, cost_per_each: 50 }),
    ];

    const result = findBundlesBySqft(products, 500, { maxProducts: 3 });

    expect(result).toHaveLength(3);
    expect(result.map((b) => b.product.id)).not.toContain('p4');
    expect(result.map((b) => b.product.id)).not.toContain('p5');
  });

  it('calculates costTotal, pricePerSqft, pricePerLinft correctly', () => {
    // p1: 48"x120", cost_per_each=32, sqftPerEach=40
    // ceil(500/40) = 13 units
    // totalSqft = 520, totalLinft = 13 * 10 = 130
    // costTotal = 13 * 32 = 416
    // pricePerSqft = 416 / 520
    // pricePerLinft = 416 / 130
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesBySqft(products, 500);

    expect(bundle.costTotal).toBeCloseTo(13 * 32, 6);
    expect(bundle.pricePerSqft).toBeCloseTo(416 / 520, 6);
    expect(bundle.pricePerLinft).toBeCloseTo(416 / 130, 6);
  });

  it('overage is 0 when requested sqft is exact multiple of product sqft', () => {
    // p1: 48"x120" → sqftPerEach = 40 → request 400 sqft → ceil(400/40) = 10 units
    // totalSqft = 400, overage = 0
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesBySqft(products, 400);

    expect(bundle.quantity).toBe(10);
    expect(bundle.overage).toBe(0);
  });
});
