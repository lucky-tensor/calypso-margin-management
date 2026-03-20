import { test, expect, describe } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from '@vitest/browser/context';
import React from 'react';
import { BundleCardBase } from '../../src/components/order-entry/BundleCardBase';
import type { Bundle, Product } from 'core';

const makeProduct = (
  id: string,
  name: string,
  sku: string,
  costPerEach: number,
  marginTarget = 25,
): Product => ({
  id,
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name,
    sku,
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120,
    weight_per_sqft: 0.58,
    cost_per_each: costPerEach,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: marginTarget,
    margin_floor: 15,
    qty_on_hand_eaches: 0,
    safety_stock_eaches: 0,
    reorder_point_eaches: 0,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
  },
});

const makeBundle = (items: Array<{ product: Product; quantity: number }>): Bundle => {
  const totalSqft = items.reduce(
    (sum, i) =>
      sum +
      i.quantity * ((i.product.properties.width_inches * i.product.properties.length_inches) / 144),
    0,
  );
  const totalLinft = items.reduce(
    (sum, i) => sum + i.quantity * (i.product.properties.length_inches / 12),
    0,
  );
  const costTotal = items.reduce(
    (sum, i) => sum + i.quantity * (i.product.properties.cost_per_each ?? 0),
    0,
  );
  return {
    items,
    totalSqft,
    totalLinft,
    overage: 0,
    overageUnit: 'linft',
    costTotal,
    pricePerSqft: totalSqft === 0 ? 0 : costTotal / totalSqft,
    pricePerLinft: totalLinft === 0 ? 0 : costTotal / totalLinft,
  };
};

const noopCreateOrders = () => {};

describe('BundleCardBase price seeding', () => {
  test('single-product bundle: $/each input is pre-filled with target-margin price', async () => {
    // cost=$32, target=25% => raw = 32 / 0.75 = 42.666... => ceil to cents => 42.67
    const product = makeProduct('prod-1', 'Alpha Mesh', 'SKU-A', 32.0, 25);
    const bundle = makeBundle([{ product, quantity: 5 }]);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="seed-single"
        displayMode="linft"
        customer="Acme Co"
        onCreateOrders={noopCreateOrders}
      />,
    );

    const input = page.getByRole('spinbutton', { name: /Sell price for Alpha Mesh/i });
    await expect.element(input).toBeVisible();
    await expect.element(input).toHaveValue(42.67);
  });

  test('bundle card renders with green (healthy) margin box on initial render without user interaction', async () => {
    // cost=$32, target=25% => pre-seeded price hits target margin => healthy (emerald) color
    const product = makeProduct('prod-2', 'Beta Mesh', 'SKU-B', 32.0, 25);
    const bundle = makeBundle([{ product, quantity: 3 }]);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="seed-green"
        displayMode="linft"
        customer="Acme Co"
        onCreateOrders={noopCreateOrders}
      />,
    );

    // MarginBox is shown (combinedEconomics computed) and uses emerald (healthy) color classes
    // The margin percent text is present, and its parent container has bg-emerald-50
    const marginPercentEl = page.getByText(/25\.0%/);
    await expect.element(marginPercentEl).toBeVisible();

    const wrapper = marginPercentEl.element().closest('.bg-emerald-50');
    expect(wrapper).not.toBeNull();
  });

  test('multi-product bundle: all $/each inputs pre-filled with correct per-product prices', async () => {
    // productA: cost=$32, target=25% => 32/0.75=42.666... => 42.67
    // productB: cost=$20, target=30% => 20/0.70=28.571... => 28.58
    const productA = makeProduct('prod-a', 'Alpha Mesh', 'SKU-A', 32.0, 25);
    const productB = makeProduct('prod-b', 'Beta Mesh', 'SKU-B', 20.0, 30);
    const bundle = makeBundle([
      { product: productA, quantity: 2 },
      { product: productB, quantity: 3 },
    ]);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="seed-multi"
        displayMode="linft"
        customer="Acme Co"
        onCreateOrders={noopCreateOrders}
      />,
    );

    const inputA = page.getByRole('spinbutton', { name: /Sell price for Alpha Mesh/i });
    const inputB = page.getByRole('spinbutton', { name: /Sell price for Beta Mesh/i });

    await expect.element(inputA).toBeVisible();
    await expect.element(inputB).toBeVisible();

    await expect.element(inputA).toHaveValue(42.67);
    await expect.element(inputB).toHaveValue(28.58);
  });
});
