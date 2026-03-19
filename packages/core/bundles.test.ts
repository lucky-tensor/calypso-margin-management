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

    // At minimum the 2 single-product bundles for 48"-wide products appear
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(
      result.every((b) => b.items.every((i) => i.product.properties.width_inches === 48)),
    ).toBe(true);
  });

  it('calculates correct unit counts for each matching product', () => {
    // p1: 48"x120" — needs ceil(2400/120) = 20 units
    // p3: 48"x60"  — needs ceil(2400/60)  = 40 units
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
      makeProduct('p3', { width_inches: 48, length_inches: 60, cost_per_each: 18 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400, { maxBundles: 100 });
    // Find single-product bundles for p1 and p3
    const p1Bundle = result.find((b) => b.items.length === 1 && b.items[0].product.id === 'p1');
    const p3Bundle = result.find((b) => b.items.length === 1 && b.items[0].product.id === 'p3');

    expect(p1Bundle).toBeDefined();
    expect(p3Bundle).toBeDefined();
    expect(p1Bundle!.items[0].quantity).toBe(20);
    expect(p3Bundle!.items[0].quantity).toBe(40);
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

    expect(bundle.items[0].quantity).toBe(20);
    expect(bundle.totalLinft).toBeCloseTo(200, 10);
    expect(bundle.totalSqft).toBeCloseTo(800, 10);
    expect(bundle.overage).toBeCloseTo(0, 10);
  });

  it('calculates non-zero overage when length is not an exact multiple', () => {
    // p1: 48"x120" — request 2500 inches → ceil(2500/120) = ceil(20.83...) = 21 units
    //   totalLinft = 21 * 10 = 210 linft
    //   totalSqft  = 21 * 40 = 840 sqft
    //   requestedSqft = (48 * 2500) / 144 ≈ 833.33 sqft
    //   overage in linft = 210 - (2500/12) ≈ 1.667 linft
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesByWidth(products, 48, 2500);

    expect(bundle.items[0].quantity).toBe(21);
    // overage is in linft: 21*10 - 2500/12
    expect(bundle.overage).toBeCloseTo(21 * 10 - 2500 / 12, 6);
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

    // With maxProducts=3, only p1/p2/p3 are eligible; no bundle should reference p4 or p5
    const allIds = result.flatMap((b) => b.items.map((i) => i.product.id));
    expect(allIds).not.toContain('p4');
    expect(allIds).not.toContain('p5');
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
    expect(result[0].costTotal).toBeLessThanOrEqual(result[1].costTotal);
  });

  it('returns overage of 0 when requested length is exact multiple of product length', () => {
    // 48"x120" product, request 2400 inches → exactly 20 rolls, no overage
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesByWidth(products, 48, 2400);

    expect(bundle.overage).toBe(0);
  });

  // ─── New multi-product tests ──────────────────────────────────────────────

  it('single-product bundles have items.length === 1', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].items).toHaveLength(1);
  });

  it('all items in a width-match bundle share the same width_inches', () => {
    // 2 products at 48", request 200 linft (2400")
    // Multi-product bundles should only combine 48"-wide products
    const products = [
      makeProduct('A', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
      makeProduct('B', { width_inches: 48, length_inches: 168, cost_per_each: 40 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400);

    for (const bundle of result) {
      for (const item of bundle.items) {
        expect(item.product.properties.width_inches).toBe(48);
      }
    }
  });

  it('returns a multi-product bundle when combination reduces overage', () => {
    // Product A: 48"x120" (10ft rolls), cost_per_each=20
    // Product B: 48"x168" (14ft rolls), cost_per_each=25
    // Target: 200 linft (2400 inches)
    //
    // Single-product: A alone → ceil(2400/120)=20 rolls → 200ft → 0ft overage (exact fit)
    // So both products fit exactly or near exactly — but let's use a target that creates overage.
    //
    // Target: 205 linft (2460 inches)
    // A alone: ceil(2460/120) = 21 rolls → 210ft → 5ft overage
    // B alone: ceil(2460/168) = 15 rolls → 210ft → 5ft overage
    // Mix: 13 A (130ft) + 1 B (14ft) = ... no. Let's try:
    //   n_A=18 (180ft) + n_B=2 (28ft) = 208ft → 3ft overage (better than 5ft)
    //   n_A=5 (50ft) + n_B=11 (154ft) = 204ft → still no
    //   n_A=1 (10ft) + n_B=14 (196ft) = 206ft → 1ft overage (better)
    //   n_A=3 (30ft) + n_B=13 (182ft) = 212ft → 7ft (worse)
    //   n_A=7 (70ft) + n_B=10 (140ft) = 210ft → 5ft
    //   n_A=14 (140ft) + n_B=5 (70ft) = 210ft → 5ft
    //   n_A=1 (10ft) + n_B=14 (196ft) = 206ft → 1ft overage ← best multi
    const products = [
      makeProduct('A', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('B', { width_inches: 48, length_inches: 168, cost_per_each: 25 }),
    ];

    const result = findBundlesByWidth(products, 48, 2460, { maxBundles: 20 });

    const multiProduct = result.filter((b) => b.items.length > 1);
    expect(multiProduct.length).toBeGreaterThan(0);

    // The best multi-product combo should have less overage than single-product best
    const singleBestOverage = Math.min(
      ...result.filter((b) => b.items.length === 1).map((b) => b.overage),
    );
    const multiBestOverage = Math.min(...multiProduct.map((b) => b.overage));
    expect(multiBestOverage).toBeLessThan(singleBestOverage);
  });

  it('maxDepth limits distinct product types per bundle', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 10 }),
      makeProduct('p2', { width_inches: 48, length_inches: 100, cost_per_each: 12 }),
      makeProduct('p3', { width_inches: 48, length_inches: 80, cost_per_each: 14 }),
      makeProduct('p4', { width_inches: 48, length_inches: 60, cost_per_each: 16 }),
      makeProduct('p5', { width_inches: 48, length_inches: 40, cost_per_each: 18 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400, { maxDepth: 2, maxBundles: 100 });

    for (const bundle of result) {
      expect(bundle.items.length).toBeLessThanOrEqual(2);
    }
  });

  it('maxIterations is enforced — returns within finite time for large catalogs', () => {
    // Create many products to generate lots of combinations
    const products = Array.from({ length: 20 }, (_, i) =>
      makeProduct(`p${i}`, {
        width_inches: 48,
        length_inches: 100 + i * 10,
        cost_per_each: 10 + i,
      }),
    );

    const start = Date.now();
    const result = findBundlesByWidth(products, 48, 5000, { maxIterations: 10 });
    const elapsed = Date.now() - start;

    // Should return quickly (well under 1 second)
    expect(elapsed).toBeLessThan(1000);
    // Should still return some results (single-product bundles at minimum)
    expect(result.length).toBeGreaterThan(0);
  });

  it('overageUnit is linft for width-mode bundles', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesByWidth(products, 48, 2400);
    expect(bundle.overageUnit).toBe('linft');
  });

  // ─── Uniqueness invariant tests ───────────────────────────────────────────

  it('returns exactly one bundle per unique product-type set (no duplicates)', () => {
    // 3 products — expect at most C(3,1)+C(3,2)+C(3,3) = 7 distinct sets
    const products = [
      makeProduct('A', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('B', { width_inches: 48, length_inches: 100, cost_per_each: 18 }),
      makeProduct('C', { width_inches: 48, length_inches: 80, cost_per_each: 15 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400, { maxBundles: 100 });

    // Collect all product-set keys
    const keys = result.map((b) =>
      b.items
        .map((i) => i.product.id)
        .sort()
        .join('|'),
    );
    const uniqueKeys = new Set(keys);

    // Every key should appear exactly once
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('sorted by overage asc, then costTotal asc', () => {
    // p1: 48"x120" (10ft rolls), cost=10 — ceil(2460/120)=21 rolls → 210ft → 5ft overage
    // p2: 48"x168" (14ft rolls), cost=200 — ceil(2460/168)=15 rolls → 210ft → 5ft overage
    // Both have same 5ft overage; cheaper (p1) should come first.
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 10 }),
      makeProduct('p2', { width_inches: 48, length_inches: 168, cost_per_each: 200 }),
    ];

    const result = findBundlesByWidth(products, 48, 2460, { maxBundles: 100 });

    for (let i = 0; i < result.length - 1; i++) {
      const a = result[i];
      const b = result[i + 1];
      if (a.overage === b.overage) {
        expect(a.costTotal).toBeLessThanOrEqual(b.costTotal);
      } else {
        expect(a.overage).toBeLessThan(b.overage);
      }
    }
  });

  it('2-product bundle beats single-product when it reduces overage', () => {
    // A: 48"x120" (10ft), cost=20 — target 205 linft (2460 inches)
    //   A alone: ceil(2460/120)=21 → 210ft → 5ft overage
    // B: 48"x168" (14ft), cost=25
    //   B alone: ceil(2460/168)=15 → 210ft → 5ft overage
    // Best A+B mix: iterate q_A from 0..21, derive q_B
    //   q_A=1 (10ft) → remaining=195ft → q_B=ceil(195/14)=14 (196ft) → total=206ft → 1ft overage
    //   This is better than 5ft overage from single-product options
    const products = [
      makeProduct('A', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('B', { width_inches: 48, length_inches: 168, cost_per_each: 25 }),
    ];

    const result = findBundlesByWidth(products, 48, 2460, { maxBundles: 100 });

    const abBundle = result.find(
      (b) =>
        b.items.length === 2 &&
        b.items.some((i) => i.product.id === 'A') &&
        b.items.some((i) => i.product.id === 'B'),
    );
    expect(abBundle).toBeDefined();

    const singleProductBestOverage = Math.min(
      ...result.filter((b) => b.items.length === 1).map((b) => b.overage),
    );
    expect(abBundle!.overage).toBeLessThan(singleProductBestOverage);
  });

  // ─── Stress tests ──────────────────────────────────────────────────────────

  it('maxIterations backstop completes within vitest timeout with 50+ products', () => {
    const products = Array.from({ length: 55 }, (_, i) =>
      makeProduct(`stress-${i}`, {
        width_inches: 48,
        length_inches: 60 + i * 5,
        cost_per_each: 10 + i,
      }),
    );

    const start = Date.now();
    const result = findBundlesByWidth(products, 48, 10000, { maxIterations: 100 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.length).toBeGreaterThan(0);
  });

  it('totalLengthInches=0 does not cause infinite loop', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const result = findBundlesByWidth(products, 48, 0);

    // ceil(0/10) = 0 eaches, should return bundles with 0 quantity
    expect(result).toBeDefined();
  });

  it('products with very small dimensions (1 inch) work correctly', () => {
    const products = [
      makeProduct('tiny', { width_inches: 1, length_inches: 1, cost_per_each: 0.5 }),
    ];

    const result = findBundlesByWidth(products, 1, 120); // 10 linft
    expect(result.length).toBeGreaterThan(0);
    // 1" length = 1/12 linft per each → need ceil(10 / (1/12)) = ceil(120) = 120 eaches
    expect(result[0].items[0].quantity).toBe(120);
  });

  it('products with very large dimensions (100,000 inches) work correctly', () => {
    const products = [
      makeProduct('huge', { width_inches: 48, length_inches: 100000, cost_per_each: 5000 }),
    ];

    const result = findBundlesByWidth(products, 48, 100000);
    expect(result.length).toBeGreaterThan(0);
    // 100000" = 8333.33 linft per each → need ceil(8333.33/8333.33) = 1
    expect(result[0].items[0].quantity).toBe(1);
  });

  it('2 products (10ft and 14ft rolls), target=200ft yields multi-product bundle with 0 overage', () => {
    // A: 120" (10ft), B: 168" (14ft), target=2400" (200ft)
    // A alone: ceil(200/10)=20 → 200ft → 0 overage
    // B alone: ceil(200/14)=15 → 210ft → 10ft overage
    // A+B: q_A=20(200ft) q_B=0 → 200ft → 0; but also q_A=6(60)+q_B=10(140)=200 → 0
    const products = [
      makeProduct('10ft', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('14ft', { width_inches: 48, length_inches: 168, cost_per_each: 25 }),
    ];

    const result = findBundlesByWidth(products, 48, 2400, { maxBundles: 100 });

    // At least one bundle (single A) should have 0 overage
    const zeroOverage = result.filter((b) => Math.abs(b.overage) < 0.001);
    expect(zeroOverage.length).toBeGreaterThan(0);

    // The multi-product combination should also exist with 0 overage
    const multiZero = result.filter((b) => b.items.length === 2 && Math.abs(b.overage) < 0.001);
    expect(multiZero.length).toBeGreaterThan(0);
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

    // At minimum the 5 single-product bundles are returned
    expect(result.length).toBeGreaterThanOrEqual(5);
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
    const p1Bundle = result.find((b) => b.items.length === 1 && b.items[0].product.id === 'p1');
    const p2Bundle = result.find((b) => b.items.length === 1 && b.items[0].product.id === 'p2');

    expect(p1Bundle).toBeDefined();
    expect(p2Bundle).toBeDefined();

    expect(p1Bundle!.items[0].quantity).toBe(13);
    expect(p1Bundle!.totalSqft).toBeCloseTo(520, 6);
    expect(p1Bundle!.overage).toBeCloseTo(20, 6);

    expect(p2Bundle!.items[0].quantity).toBe(10);
    expect(p2Bundle!.totalSqft).toBeCloseTo(500, 6);
    expect(p2Bundle!.overage).toBeCloseTo(0, 6);
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
    expect(result[0].costTotal).toBeLessThanOrEqual(result[1].costTotal);
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

    const allIds = result.flatMap((b) => b.items.map((i) => i.product.id));
    expect(allIds).not.toContain('p4');
    expect(allIds).not.toContain('p5');
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

    const result = findBundlesBySqft(products, 500);
    const bundle = result.find((b) => b.items.length === 1 && b.items[0].product.id === 'p1');

    expect(bundle).toBeDefined();
    expect(bundle!.costTotal).toBeCloseTo(13 * 32, 6);
    expect(bundle!.pricePerSqft).toBeCloseTo(416 / 520, 6);
    expect(bundle!.pricePerLinft).toBeCloseTo(416 / 130, 6);
  });

  it('overage is 0 when requested sqft is exact multiple of product sqft', () => {
    // p1: 48"x120" → sqftPerEach = 40 → request 400 sqft → ceil(400/40) = 10 units
    // totalSqft = 400, overage = 0
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const result = findBundlesBySqft(products, 400);
    const bundle = result.find((b) => b.items.length === 1 && b.items[0].product.id === 'p1');

    expect(bundle).toBeDefined();
    expect(bundle!.items[0].quantity).toBe(10);
    expect(bundle!.overage).toBe(0);
  });

  // ─── New multi-product tests ──────────────────────────────────────────────

  it('single-product bundles have items.length === 1', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const result = findBundlesBySqft(products, 500);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].items).toHaveLength(1);
  });

  it('returns multi-product bundles mixing products of different dimensions', () => {
    // Product A: 48"x120" (sqftPerEach=40), cost=20
    // Product B: 60"x120" (sqftPerEach=50), cost=25
    // Product C: 36"x120" (sqftPerEach=30), cost=15
    // Target: 500 sqft
    //
    // Single-product options:
    //   A alone: ceil(500/40)=13 → 520 sqft → 20 overage
    //   B alone: ceil(500/50)=10 → 500 sqft → 0 overage (exact)
    //   C alone: ceil(500/30)=17 → 510 sqft → 10 overage
    //
    // Since B can hit 0 overage, let's use target=505 sqft
    //   A alone: ceil(505/40)=13 → 520 sqft → 15 overage
    //   B alone: ceil(505/50)=11 → 550 sqft → 45 overage
    //   C alone: ceil(505/30)=17 → 510 sqft → 5 overage
    // A+C mix: n_A=4 (160sqft) + n_C=12 (360sqft) = 520sqft → 15 overage
    //          n_A=1 (40sqft) + n_C=16 (480sqft) = 520sqft → 15 overage
    //          n_A=3 (120sqft) + n_C=13 (390sqft) = 510sqft → 5 overage
    //          n_A=0 + n_C: single product
    // Actually n_A=5 (200) + n_C=11 (330) = 530 → 25 overage
    // n_A=2 (80) + n_C=15 (450) = 530 → 25 overage
    // Hmm. Let's try target=503:
    //   C alone: ceil(503/30)=17 → 510 → 7 overage
    //   A+B: n_A=1(40)+n_B=10(500)=540 → 37
    //        n_A=3(120)+n_B=8(400)=520 → 17
    //   Doesn't help much. Use simpler: target=505, expect multi-product to appear.
    const products = [
      makeProduct('A', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('B', { width_inches: 60, length_inches: 120, cost_per_each: 25 }),
      makeProduct('C', { width_inches: 36, length_inches: 120, cost_per_each: 15 }),
    ];

    const result = findBundlesBySqft(products, 505, { maxBundles: 50 });

    const multiProduct = result.filter((b) => b.items.length > 1);
    expect(multiProduct.length).toBeGreaterThan(0);

    // Multi-product bundles can mix different widths
    const hasMultiWidth = multiProduct.some((b) => {
      const widths = new Set(b.items.map((i) => i.product.properties.width_inches));
      return widths.size > 1;
    });
    expect(hasMultiWidth).toBe(true);
  });

  it('maxDepth limits distinct product types per bundle', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 10 }),
      makeProduct('p2', { width_inches: 60, length_inches: 100, cost_per_each: 12 }),
      makeProduct('p3', { width_inches: 36, length_inches: 80, cost_per_each: 14 }),
      makeProduct('p4', { width_inches: 72, length_inches: 60, cost_per_each: 16 }),
      makeProduct('p5', { width_inches: 48, length_inches: 40, cost_per_each: 18 }),
    ];

    const result = findBundlesBySqft(products, 500, { maxDepth: 2, maxBundles: 100 });

    for (const bundle of result) {
      expect(bundle.items.length).toBeLessThanOrEqual(2);
    }
  });

  it('maxIterations is enforced — returns within finite time for large catalogs', () => {
    // Create many products to generate lots of combinations
    const products = Array.from({ length: 20 }, (_, i) =>
      makeProduct(`p${i}`, {
        width_inches: 48 + i * 4,
        length_inches: 100 + i * 10,
        cost_per_each: 10 + i,
      }),
    );

    const start = Date.now();
    const result = findBundlesBySqft(products, 5000, { maxIterations: 10 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(result.length).toBeGreaterThan(0);
  });

  it('overageUnit is sqft for area-mode bundles', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const [bundle] = findBundlesBySqft(products, 400);
    expect(bundle.overageUnit).toBe('sqft');
  });

  // ─── Uniqueness invariant tests ───────────────────────────────────────────

  it('returns exactly one bundle per unique product-type set (no duplicates)', () => {
    // 3 products — expect at most C(3,1)+C(3,2)+C(3,3) = 7 distinct sets
    const products = [
      makeProduct('A', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('B', { width_inches: 60, length_inches: 100, cost_per_each: 18 }),
      makeProduct('C', { width_inches: 36, length_inches: 80, cost_per_each: 15 }),
    ];

    const result = findBundlesBySqft(products, 500, { maxBundles: 100 });

    // Collect all product-set keys
    const keys = result.map((b) =>
      b.items
        .map((i) => i.product.id)
        .sort()
        .join('|'),
    );
    const uniqueKeys = new Set(keys);

    // Every key should appear exactly once
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('sorted by overage asc, then costTotal asc', () => {
    const products = [
      makeProduct('A', { width_inches: 48, length_inches: 120, cost_per_each: 20 }),
      makeProduct('B', { width_inches: 60, length_inches: 100, cost_per_each: 18 }),
      makeProduct('C', { width_inches: 36, length_inches: 80, cost_per_each: 15 }),
    ];

    const result = findBundlesBySqft(products, 500, { maxBundles: 100 });

    for (let i = 0; i < result.length - 1; i++) {
      const a = result[i];
      const b = result[i + 1];
      if (a.overage === b.overage) {
        expect(a.costTotal).toBeLessThanOrEqual(b.costTotal);
      } else {
        expect(a.overage).toBeLessThan(b.overage);
      }
    }
  });

  it('2-product bundle beats single-product when it reduces overage', () => {
    // A: 48"x120" (sqftPerEach=40), cost=20
    //   A alone: ceil(503/40)=13 → 520sqft → 17 overage
    // B: 60"x100" (sqftPerEach=41.667), cost=18
    //   B alone: ceil(503/41.667)=13 → 541.67sqft → 38.67 overage
    // Target: 503 sqft
    // A+B: try q_A=0..13, derive q_B to cover remainder
    //   q_A=12 (480sqft) + q_B=ceil(23/41.667)=1 (41.667sqft) = 521.67sqft → 18.67 overage
    //   q_A=13 (520sqft) → remaining<=0 → q_B=0 → total=520sqft → 17 overage (same as A alone)
    // Better scenario: use products that create obvious improvement
    // A: 48"x120" (sqft=40), B: 48"x60" (sqft=20), target=100
    //   A alone: ceil(100/40)=3 → 120sqft → 20 overage
    //   B alone: ceil(100/20)=5 → 100sqft → 0 overage (already optimal)
    // Use target=110:
    //   A alone: ceil(110/40)=3 → 120sqft → 10 overage
    //   B alone: ceil(110/20)=6 → 120sqft → 10 overage
    //   A+B: q_A=1(40) + q_B=ceil(70/20)=4(80) = 120sqft → 10 overage (same)
    //        q_A=2(80) + q_B=ceil(30/20)=2(40) = 120sqft → 10 overage (same)
    //   Hmm. Use target=105:
    //   A alone: ceil(105/40)=3 → 120 → 15 overage
    //   B alone: ceil(105/20)=6 → 120 → 15 overage
    //   A+B: q_A=1(40)+q_B=ceil(65/20)=4(80)=120 → 15; q_A=2(80)+q_B=ceil(25/20)=2(40)=120 → 15
    //   All the same due to the numbers. Use C: 48"x30" (sqft=10), target=105:
    //   C alone: ceil(105/10)=11 → 110 → 5 overage (better!)
    //   A+C: q_A=1(40)+q_C=ceil(65/10)=7(70)=110 → 5 overage (same as C alone)
    //   A+B: q_A=2(80)+q_B=ceil(25/20)=2(40)=120 → 15 overage
    //   B+C: q_B=0+q_C=ceil(105/10)=11(110)=110 → 5 overage
    //   A+B+C: q_A=1(40)+q_B=2(40)+q_C=ceil(25/10)=3(30)=110 → 5 overage
    // Best: C alone or combos with C reach 5 overage. A+C should appear.

    // Let's use: A=sqft 7, B=sqft 11, target=50
    //   A alone: ceil(50/7)=8 → 56 → 6 overage
    //   B alone: ceil(50/11)=5 → 55 → 5 overage
    //   A+B: iterate q_A 0..8
    //     q_A=6(42)+q_B=ceil(8/11)=1(11)=53 → 3 overage  ← better!
    //     q_A=7(49)+q_B=ceil(1/11)=1(11)=60 → 10 overage
    //     q_A=5(35)+q_B=ceil(15/11)=2(22)=57 → 7 overage
    //     q_A=4(28)+q_B=ceil(22/11)=2(22)=50 → 0 overage ← best!
    // A: 48"x(7*144/48)=21" → width=48, length=21 (sqft = 48*21/144=7)
    // B: 48"x(11*144/48)=33" → width=48, length=33 (sqft = 48*33/144=11)
    const productsNew = [
      makeProduct('X', { width_inches: 48, length_inches: 21, cost_per_each: 10 }),
      makeProduct('Y', { width_inches: 48, length_inches: 33, cost_per_each: 15 }),
    ];

    const resultNew = findBundlesBySqft(productsNew, 50, { maxBundles: 100 });

    const xyBundle = resultNew.find(
      (b) =>
        b.items.length === 2 &&
        b.items.some((i) => i.product.id === 'X') &&
        b.items.some((i) => i.product.id === 'Y'),
    );
    expect(xyBundle).toBeDefined();

    const singleProductBestOverage = Math.min(
      ...resultNew.filter((b) => b.items.length === 1).map((b) => b.overage),
    );
    expect(xyBundle!.overage).toBeLessThan(singleProductBestOverage);
  });

  // ─── Stress tests ──────────────────────────────────────────────────────────

  it('maxIterations backstop completes within vitest timeout with 50+ products', () => {
    const products = Array.from({ length: 55 }, (_, i) =>
      makeProduct(`sqft-stress-${i}`, {
        width_inches: 36 + (i % 10) * 4,
        length_inches: 60 + i * 5,
        cost_per_each: 10 + i,
      }),
    );

    const start = Date.now();
    const result = findBundlesBySqft(products, 10000, { maxIterations: 100 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.length).toBeGreaterThan(0);
  });

  it('maxDepth=2 with 50 products — no bundle has > 2 distinct product types', () => {
    const products = Array.from({ length: 50 }, (_, i) =>
      makeProduct(`depth-${i}`, {
        width_inches: 36 + (i % 8) * 6,
        length_inches: 60 + i * 3,
        cost_per_each: 10 + i * 0.5,
      }),
    );

    const result = findBundlesBySqft(products, 5000, { maxDepth: 2, maxBundles: 200 });

    for (const bundle of result) {
      expect(bundle.items.length).toBeLessThanOrEqual(2);
    }
  });

  it('totalSqft=0 does not cause infinite loop', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const result = findBundlesBySqft(products, 0);
    expect(result).toBeDefined();
  });

  it('totalSqft=0.001 does not cause infinite loop', () => {
    const products = [
      makeProduct('p1', { width_inches: 48, length_inches: 120, cost_per_each: 32 }),
    ];

    const result = findBundlesBySqft(products, 0.001);
    expect(result).toBeDefined();
    // ceil(0.001/40) = 1 → 1 unit → overage = 40 - 0.001 ≈ 39.999
    expect(result.length).toBeGreaterThan(0);
  });

  it('products with extreme dimensions (1"x1") work correctly', () => {
    const products = [
      makeProduct('tiny', { width_inches: 1, length_inches: 1, cost_per_each: 0.01 }),
    ];

    const result = findBundlesBySqft(products, 10);
    expect(result.length).toBeGreaterThan(0);
    // sqftPerEach = (1*1)/144 = 1/144
    // ceil(10/(1/144)) = ceil(1440) = 1440
    expect(result[0].items[0].quantity).toBe(1440);
  });

  it('products with very large dimensions (100,000 inches) work correctly', () => {
    const products = [
      makeProduct('huge', {
        width_inches: 100000,
        length_inches: 100000,
        cost_per_each: 1000000,
      }),
    ];

    const result = findBundlesBySqft(products, 100);
    expect(result.length).toBeGreaterThan(0);
    // sqftPerEach = (100000*100000)/144 = massive → need ceil(100/massive) = 1
    expect(result[0].items[0].quantity).toBe(1);
  });
});
