import { describe, it, expect } from 'vitest';
import {
  convertUnits,
  calculateCost,
  calculateMargin,
  evaluateMargin,
  computeOrderFields,
} from './conversions';
import type { Product } from './types';

// Standard test product: 4x4 Welded Wire Mesh 10ga, 48"x120", cost $32/each
const makeProduct = (overrides: Partial<Product['properties']> = {}): Product => ({
  id: 'prod-1',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: '4x4 Welded Wire Mesh - 10ga',
    sku: 'WM-4x4-10GA',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120,
    weight_per_sqft: 0.58,
    cost_per_each: 32.0,
    cost_per_linft: 3.2,
    cost_per_sqft: 0.8,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
    ...overrides,
  },
});

// ─── convertUnits ─────────────────────────────────────────────────────────────

describe('convertUnits', () => {
  it('converts 10 eaches to linft and sqft for 48"x120" product', () => {
    const product = makeProduct();
    const result = convertUnits(product, 10, 'each');

    // 10 * (120/12) = 100 linft; 10 * (48*120)/144 = 400 sqft
    expect(result.eaches).toBe(10);
    expect(result.linear_feet).toBe(100);
    expect(result.square_feet).toBe(400);
  });

  it('converts 100 linft to eaches and sqft (round-trip consistency)', () => {
    const product = makeProduct();
    const result = convertUnits(product, 100, 'linear_foot');

    // 100 / (120/12) = 100 / 10 = 10 eaches; 10 * (48*120)/144 = 400 sqft
    expect(result.eaches).toBe(10);
    expect(result.linear_feet).toBe(100);
    expect(result.square_feet).toBe(400);
  });

  it('converts 50 sqft to eaches and linft', () => {
    const product = makeProduct();
    const result = convertUnits(product, 50, 'square_foot');

    // sqftPerEach = (48*120)/144 = 40
    // eaches = 50 / 40 = 1.25
    // linft = 1.25 * 10 = 12.5
    expect(result.eaches).toBeCloseTo(1.25, 10);
    expect(result.linear_feet).toBeCloseTo(12.5, 10);
    expect(result.square_feet).toBeCloseTo(50, 10);
  });

  it('converts 400 sqft back to 10 eaches and 100 linft (full round-trip from eaches)', () => {
    const product = makeProduct();
    const result = convertUnits(product, 400, 'square_foot');

    expect(result.eaches).toBeCloseTo(10, 10);
    expect(result.linear_feet).toBeCloseTo(100, 10);
    expect(result.square_feet).toBeCloseTo(400, 10);
  });

  it('handles fractional linear foot quantities (Scenario 3: 73 linft)', () => {
    const product = makeProduct();
    const result = convertUnits(product, 73, 'linear_foot');

    // 73 / 10 = 7.3 eaches; 7.3 * 40 = 292 sqft
    expect(result.eaches).toBeCloseTo(7.3, 10);
    expect(result.linear_feet).toBeCloseTo(73, 10);
    expect(result.square_feet).toBeCloseTo(292, 10);
  });

  it('handles 1 each correctly', () => {
    const product = makeProduct();
    const result = convertUnits(product, 1, 'each');

    // length_inches=120 → linft = 10; sqft = (48*120)/144 = 40
    expect(result.eaches).toBe(1);
    expect(result.linear_feet).toBe(10);
    expect(result.square_feet).toBe(40);
  });

  it('handles zero quantity', () => {
    const product = makeProduct();
    const result = convertUnits(product, 0, 'each');

    expect(result.eaches).toBe(0);
    expect(result.linear_feet).toBe(0);
    expect(result.square_feet).toBe(0);
  });

  it('converts from linear_foot using Scenario 2 values (50 linft)', () => {
    const product = makeProduct();
    const result = convertUnits(product, 50, 'linear_foot');

    // 50 / 10 = 5 eaches; 5 * 40 = 200 sqft
    expect(result.eaches).toBe(5);
    expect(result.linear_feet).toBe(50);
    expect(result.square_feet).toBe(200);
  });
});

// ─── calculateCost ────────────────────────────────────────────────────────────

describe('calculateCost', () => {
  it('uses cost_per_each when primary_cost_basis is each', () => {
    const product = makeProduct({ primary_cost_basis: 'each' });
    const conversions = { eaches: 10, linear_feet: 100, square_feet: 400 };

    // 10 * 32 = 320
    expect(calculateCost(product, conversions)).toBe(320);
  });

  it('uses cost_per_linft when primary_cost_basis is linear_foot', () => {
    const product = makeProduct({ primary_cost_basis: 'linear_foot' });
    const conversions = { eaches: 10, linear_feet: 100, square_feet: 400 };

    // 100 * 3.20 = 320
    expect(calculateCost(product, conversions)).toBeCloseTo(320, 10);
  });

  it('uses cost_per_sqft when primary_cost_basis is square_foot', () => {
    const product = makeProduct({ primary_cost_basis: 'square_foot' });
    const conversions = { eaches: 10, linear_feet: 100, square_feet: 400 };

    // 400 * 0.80 = 320
    expect(calculateCost(product, conversions)).toBeCloseTo(320, 10);
  });

  it('produces the same total cost regardless of which basis is used (consistent rates)', () => {
    const conversions = { eaches: 10, linear_feet: 100, square_feet: 400 };

    const costByEach = calculateCost(makeProduct({ primary_cost_basis: 'each' }), conversions);
    const costByLinft = calculateCost(makeProduct({ primary_cost_basis: 'linear_foot' }), conversions);
    const costBySqft = calculateCost(makeProduct({ primary_cost_basis: 'square_foot' }), conversions);

    expect(costByEach).toBeCloseTo(costByLinft, 8);
    expect(costByEach).toBeCloseTo(costBySqft, 8);
  });

  it('handles null cost for non-primary basis without error', () => {
    const product = makeProduct({
      primary_cost_basis: 'each',
      cost_per_linft: null,
      cost_per_sqft: null,
    });
    const conversions = { eaches: 5, linear_feet: 50, square_feet: 200 };

    expect(calculateCost(product, conversions)).toBe(160); // 5 * 32
  });
});

// ─── calculateMargin ──────────────────────────────────────────────────────────

describe('calculateMargin', () => {
  it('calculates positive margin (Scenario 1)', () => {
    const result = calculateMargin(450, 320);

    expect(result.dollars).toBeCloseTo(130, 10);
    // 130/450 * 100 ≈ 28.888...
    expect(result.percent).toBeCloseTo((130 / 450) * 100, 10);
  });

  it('calculates zero margin (revenue equals cost)', () => {
    const result = calculateMargin(100, 100);

    expect(result.dollars).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('calculates negative margin (loss)', () => {
    const result = calculateMargin(100, 150);

    expect(result.dollars).toBe(-50);
    expect(result.percent).toBeCloseTo(-50, 10);
  });

  it('handles zero revenue without error (returns 0% margin)', () => {
    const result = calculateMargin(0, 0);

    expect(result.dollars).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('handles zero revenue with non-zero cost (no division by zero)', () => {
    const result = calculateMargin(0, 50);

    expect(result.dollars).toBe(-50);
    expect(result.percent).toBe(0); // defined as 0 when revenue=0
  });

  it('matches Scenario 2 economics (50 linft at $5/linft, 5 eaches @ $32)', () => {
    const result = calculateMargin(250, 160);

    expect(result.dollars).toBeCloseTo(90, 10);
    expect(result.percent).toBeCloseTo(36, 10);
  });
});

// ─── evaluateMargin ───────────────────────────────────────────────────────────

describe('evaluateMargin', () => {
  const target = 25;
  const floor = 15;

  it('returns healthy when margin is at or above target', () => {
    expect(evaluateMargin(25, target, floor)).toBe('healthy');
    expect(evaluateMargin(28.9, target, floor)).toBe('healthy');
    expect(evaluateMargin(100, target, floor)).toBe('healthy');
  });

  it('returns warning when margin is between floor and target', () => {
    expect(evaluateMargin(15, target, floor)).toBe('warning');
    expect(evaluateMargin(20, target, floor)).toBe('warning');
    expect(evaluateMargin(24.9, target, floor)).toBe('warning');
  });

  it('returns critical when margin is below floor', () => {
    expect(evaluateMargin(14.9, target, floor)).toBe('critical');
    expect(evaluateMargin(0, target, floor)).toBe('critical');
    expect(evaluateMargin(-10, target, floor)).toBe('critical');
  });

  it('uses per-product thresholds (Scenario 4: target=18, floor=10)', () => {
    // 13.7% is between 10% floor and 18% target → warning
    expect(evaluateMargin(13.7, 18, 10)).toBe('warning');
    expect(evaluateMargin(18, 18, 10)).toBe('healthy');
    expect(evaluateMargin(9.9, 18, 10)).toBe('critical');
  });
});

// ─── computeOrderFields ───────────────────────────────────────────────────────

describe('computeOrderFields', () => {
  it('computes all fields for Scenario 1 (10 eaches at $45 each)', () => {
    const product = makeProduct();
    const result = computeOrderFields(product, 10, 'each', 45);

    expect(result.qty_eaches).toBe(10);
    expect(result.qty_linft).toBe(100);
    expect(result.qty_sqft).toBe(400);
    expect(result.total_revenue).toBe(450);
    expect(result.total_cost).toBe(320);
    expect(result.margin_dollars).toBeCloseTo(130, 10);
    expect(result.margin_percent).toBeCloseTo((130 / 450) * 100, 6);
  });

  it('computes all fields for Scenario 2 (50 linft at $5/linft)', () => {
    const product = makeProduct();
    const result = computeOrderFields(product, 50, 'linear_foot', 5);

    expect(result.qty_eaches).toBe(5);
    expect(result.qty_linft).toBe(50);
    expect(result.qty_sqft).toBe(200);
    expect(result.total_revenue).toBe(250);
    expect(result.total_cost).toBe(160); // 5 eaches * $32
    expect(result.margin_dollars).toBeCloseTo(90, 10);
    expect(result.margin_percent).toBeCloseTo(36, 10);
  });

  it('computes all fields for Scenario 3 (73 linft at $4.80, fractional eaches)', () => {
    const product = makeProduct();
    const result = computeOrderFields(product, 73, 'linear_foot', 4.8);

    expect(result.qty_eaches).toBeCloseTo(7.3, 10);
    expect(result.qty_linft).toBeCloseTo(73, 10);
    expect(result.qty_sqft).toBeCloseTo(292, 10);
    expect(result.total_revenue).toBeCloseTo(350.4, 10);
    expect(result.total_cost).toBeCloseTo(7.3 * 32, 10);
    expect(result.margin_dollars).toBeCloseTo(350.4 - 7.3 * 32, 10);
  });

  it('handles zero sell price (zero revenue, zero or negative margin)', () => {
    const product = makeProduct();
    const result = computeOrderFields(product, 10, 'each', 0);

    expect(result.total_revenue).toBe(0);
    expect(result.total_cost).toBe(320);
    expect(result.margin_dollars).toBe(-320);
    expect(result.margin_percent).toBe(0); // revenue=0, returns 0%
  });

  it('uses linear_foot basis cost calculation correctly', () => {
    const product = makeProduct({ primary_cost_basis: 'linear_foot' });
    const result = computeOrderFields(product, 10, 'each', 45);

    // 100 linft * $3.20 = $320 — same as per-each for consistent rates
    expect(result.total_cost).toBeCloseTo(320, 6);
  });

  it('uses square_foot basis cost calculation correctly', () => {
    const product = makeProduct({ primary_cost_basis: 'square_foot' });
    const result = computeOrderFields(product, 10, 'each', 45);

    // 400 sqft * $0.80 = $320 — same as per-each for consistent rates
    expect(result.total_cost).toBeCloseTo(320, 6);
  });
});
