import { describe, it, expect } from 'vitest';
import { computeStockPosition, checkOrderStock, computeDaysOfStock } from './inventory';
import type { InventoryProductInput } from './inventory';

// Standard test product with inventory fields
const makeInventoryProduct = (
  overrides: Partial<InventoryProductInput> = {},
): InventoryProductInput => ({
  qty_on_hand: 100,
  reorder_point: 30,
  safety_stock: 10,
  reorder_qty: 50,
  lead_time_days: 7,
  pending_order_weight: 0.7,
  avg_daily_usage: 5,
  ...overrides,
});

// ─── computeStockPosition ────────────────────────────────────────────────────

describe('computeStockPosition', () => {
  it('computes effective_available with pending_order_weight = 0.0', () => {
    const product = makeInventoryProduct({ pending_order_weight: 0.0 });
    const result = computeStockPosition(product, 20, 30);

    // effective = 100 - 20 - (30 * 0.0) = 80
    expect(result.effective_available).toBe(80);
    expect(result.net_available).toBe(80);
    expect(result.committed_qty).toBe(20);
    expect(result.pending_qty).toBe(30);
    expect(result.status).toBe('healthy');
  });

  it('computes effective_available with pending_order_weight = 0.5', () => {
    const product = makeInventoryProduct({ pending_order_weight: 0.5 });
    const result = computeStockPosition(product, 20, 30);

    // effective = 100 - 20 - (30 * 0.5) = 65
    expect(result.effective_available).toBe(65);
    expect(result.net_available).toBe(80);
    expect(result.status).toBe('healthy');
  });

  it('computes effective_available with pending_order_weight = 0.7', () => {
    const product = makeInventoryProduct({ pending_order_weight: 0.7 });
    const result = computeStockPosition(product, 20, 30);

    // effective = 100 - 20 - (30 * 0.7) = 59
    expect(result.effective_available).toBe(59);
    expect(result.status).toBe('healthy');
  });

  it('computes effective_available with pending_order_weight = 1.0', () => {
    const product = makeInventoryProduct({ pending_order_weight: 1.0 });
    const result = computeStockPosition(product, 20, 30);

    // effective = 100 - 20 - (30 * 1.0) = 50
    expect(result.effective_available).toBe(50);
    expect(result.status).toBe('healthy');
  });

  it('returns warning status when effective is between safety and reorder', () => {
    const product = makeInventoryProduct({ pending_order_weight: 1.0 });
    // effective = 100 - 50 - (30 * 1.0) = 20 (> 10 safety, <= 30 reorder)
    const result = computeStockPosition(product, 50, 30);

    expect(result.effective_available).toBe(20);
    expect(result.status).toBe('warning');
  });

  it('returns critical status when effective is at or below safety stock', () => {
    const product = makeInventoryProduct({ pending_order_weight: 1.0 });
    // effective = 100 - 60 - (30 * 1.0) = 10 (<= 10 safety)
    const result = computeStockPosition(product, 60, 30);

    expect(result.effective_available).toBe(10);
    expect(result.status).toBe('critical');
  });

  it('includes days_of_stock when avg_daily_usage > 0', () => {
    const product = makeInventoryProduct({
      pending_order_weight: 0.0,
      avg_daily_usage: 10,
    });
    const result = computeStockPosition(product, 20, 0);

    // effective = 80, days = 80 / 10 = 8
    expect(result.days_of_stock).toBe(8);
  });

  it('returns null for days_of_stock when avg_daily_usage is 0', () => {
    const product = makeInventoryProduct({ avg_daily_usage: 0 });
    const result = computeStockPosition(product, 0, 0);

    expect(result.days_of_stock).toBeNull();
  });
});

// ─── checkOrderStock ─────────────────────────────────────────────────────────

describe('checkOrderStock', () => {
  it('allows order when projected stock is healthy', () => {
    const product = makeInventoryProduct({ pending_order_weight: 1.0 });
    // current: effective = 100 - 10 - (5 * 1.0) = 85
    // projected draft = 5 + 5 = 10 => projected_effective = 100 - 10 - (10 * 1.0) = 80
    const result = checkOrderStock(product, 10, 5, 5);

    expect(result.allowed).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.block_reason).toBeNull();
    expect(result.projected_effective).toBe(80);
    expect(result.projected_status).toBe('healthy');
  });

  it('allows order with warning when projected stock at or below reorder point', () => {
    const product = makeInventoryProduct({ pending_order_weight: 1.0 });
    // projected draft = 0 + 50 = 50 => projected_effective = 100 - 20 - (50 * 1.0) = 30
    // 30 <= reorder_point (30), > safety_stock (10) => warning
    const result = checkOrderStock(product, 20, 0, 50);

    expect(result.allowed).toBe(true);
    expect(result.warning).toBe('Projected stock at or below reorder point');
    expect(result.block_reason).toBeNull();
    expect(result.projected_effective).toBe(30);
    expect(result.projected_status).toBe('warning');
  });

  it('blocks order when projected stock at or below safety stock', () => {
    const product = makeInventoryProduct({ pending_order_weight: 1.0 });
    // projected draft = 0 + 80 = 80 => projected_effective = 100 - 10 - (80 * 1.0) = 10
    // 10 <= safety_stock (10) => blocked
    const result = checkOrderStock(product, 10, 0, 80);

    expect(result.allowed).toBe(false);
    expect(result.warning).toBeNull();
    expect(result.block_reason).toBe('Projected stock at or below safety stock level');
    expect(result.projected_effective).toBe(10);
    expect(result.projected_status).toBe('critical');
  });

  it('blocks order when projected stock is negative', () => {
    const product = makeInventoryProduct({ pending_order_weight: 1.0 });
    // projected draft = 0 + 200 = 200 => projected_effective = 100 - 0 - (200 * 1.0) = -100
    const result = checkOrderStock(product, 0, 0, 200);

    expect(result.allowed).toBe(false);
    expect(result.projected_effective).toBe(-100);
    expect(result.projected_status).toBe('critical');
  });

  it('returns current position along with projection', () => {
    const product = makeInventoryProduct({ pending_order_weight: 0.5 });
    const result = checkOrderStock(product, 10, 20, 5);

    // Current position: effective = 100 - 10 - (20 * 0.5) = 80
    expect(result.position.effective_available).toBe(80);
    expect(result.position.committed_qty).toBe(10);
    expect(result.position.pending_qty).toBe(20);
  });
});

// ─── computeDaysOfStock ──────────────────────────────────────────────────────

describe('computeDaysOfStock', () => {
  it('computes days of stock for normal usage', () => {
    expect(computeDaysOfStock(100, 10)).toBe(10);
  });

  it('returns null when avgDailyUsage is 0', () => {
    expect(computeDaysOfStock(100, 0)).toBeNull();
  });

  it('handles fractional days', () => {
    expect(computeDaysOfStock(10, 3)).toBeCloseTo(3.333, 2);
  });

  it('handles zero effective available', () => {
    expect(computeDaysOfStock(0, 5)).toBe(0);
  });

  it('handles negative effective available', () => {
    expect(computeDaysOfStock(-10, 5)).toBe(-2);
  });
});
