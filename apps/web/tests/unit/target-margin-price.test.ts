import { describe, it, expect } from 'vitest';
import { targetMarginPricePerEach } from '../../src/components/OrderEntry';
import { calculateMargin } from 'core';
import type { Product } from 'core';

const makeProduct = (cost_per_each: number, margin_target: number): Product => ({
  id: 'prod-test',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: 'Test Product',
    sku: 'TEST-001',
    material: 'Steel',
    width_inches: 48,
    length_inches: 120,
    weight_per_sqft: 0.58,
    cost_per_each,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target,
    margin_floor: 15,
  },
});

describe('targetMarginPricePerEach', () => {
  it('returns a price yielding margin >= target for cost=$32, target=25%', () => {
    const product = makeProduct(32, 25);
    const priceStr = targetMarginPricePerEach(product);
    const price = parseFloat(priceStr);

    // Price must be a 2-decimal string
    expect(priceStr).toMatch(/^\d+\.\d{2}$/);

    // Margin at this price must be >= 25%
    const { percent } = calculateMargin(price, 32);
    expect(percent).toBeGreaterThanOrEqual(25);
  });

  it('returns a price yielding margin >= target for cost=$19.20, target=25%', () => {
    const product = makeProduct(19.2, 25);
    const priceStr = targetMarginPricePerEach(product);
    const price = parseFloat(priceStr);

    expect(priceStr).toMatch(/^\d+\.\d{2}$/);

    const { percent } = calculateMargin(price, 19.2);
    expect(percent).toBeGreaterThanOrEqual(25);
  });

  it('uses ceiling so displayed price never rounds below target margin', () => {
    // cost=$19.21, target=25%: raw = 19.21/0.75 = 25.6133...
    // floor(toFixed(2)) would give 25.61 → margin = (25.61-19.21)/25.61*100 < 25%
    // ceiling must give 25.62 → margin >= 25%
    const product = makeProduct(19.21, 25);
    const priceStr = targetMarginPricePerEach(product);
    const price = parseFloat(priceStr);

    const { percent } = calculateMargin(price, 19.21);
    expect(percent).toBeGreaterThanOrEqual(25);
  });

  it('guarantee holds across a range of costs with target=25%', () => {
    // Test multiple costs that might trigger rounding edge cases
    const testCosts = [1.0, 5.0, 10.0, 19.2, 19.21, 32.0, 47.33, 100.0];
    for (const cost of testCosts) {
      const product = makeProduct(cost, 25);
      const priceStr = targetMarginPricePerEach(product);
      const price = parseFloat(priceStr);
      const { percent } = calculateMargin(price, cost);
      expect(percent).toBeGreaterThanOrEqual(25);
    }
  });
});
