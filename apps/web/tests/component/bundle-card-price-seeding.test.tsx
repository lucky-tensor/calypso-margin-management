import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import { BundleCardBase } from '../../src/components/order-entry/BundleCardBase';
import type { Product, Bundle } from 'core';

// product48a: cost_per_each=32, margin_target=25
// targetPrice = Math.ceil((32 / (1 - 0.25)) * 100) / 100 = Math.ceil(42.6666... * 100) / 100 = 42.67
const product48a: Product = {
  id: 'prod-48a',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: '4x4 Welded Wire Mesh',
    sku: 'WM-48-10FT',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120, // 10 ft roll
    weight_per_sqft: 0.58,
    cost_per_each: 32.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
  },
};

// product48b: cost_per_each=20, margin_target=30
// targetPrice = Math.ceil((20 / (1 - 0.30)) * 100) / 100 = Math.ceil(28.5714... * 100) / 100 = 28.58
const product48b: Product = {
  id: 'prod-48b',
  created_at: '2024-01-02T00:00:00Z',
  properties: {
    name: '2x4 Welded Wire Mesh',
    sku: 'WM-48-5FT',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 60, // 5 ft roll
    weight_per_sqft: 0.7,
    cost_per_each: 20.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 30,
    margin_floor: 20,
  },
};

const ALL_PRODUCTS = [product48a, product48b];

async function switchToSearchByUoM(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();
  await screen.getByRole('button', { name: 'Search by UoM' }).click();
}

describe('Bundle card price seeding (#51)', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('single-product bundle card $/each input is pre-filled with target-margin price', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    // product48a target price: Math.ceil((32 / 0.75) * 100) / 100 = 42.67
    const priceInput = screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh');
    await expect.element(priceInput).toBeVisible();
    await expect.element(priceInput).toHaveValue(42.67);
  });

  test('margin box shows healthy (green/emerald) on initial render without user interaction', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    // With seeded target-margin price, margin should be at or above target -> green
    // 20 rolls * 42.67 = 853.40 revenue, 20 * 32 = 640 cost
    // margin = (853.40 - 640) / 853.40 = 25.0% -> healthy
    const marginEl = screen.getByText(/25\.0%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-emerald-50')).not.toBeNull();
  });

  test('multi-product bundle card has all $/each inputs pre-filled with respective target prices', async () => {
    // Render BundleCardBase directly with a multi-product bundle to avoid
    // ambiguity from multiple bundle cards on the page.
    const bundle: Bundle = {
      items: [
        { product: product48a, quantity: 10 },
        { product: product48b, quantity: 20 },
      ],
      totalSqft: 733.33,
      totalLinft: 200,
      overage: 0,
      overageUnit: 'linft',
      costTotal: 10 * 32 + 20 * 20,
      pricePerSqft: 0,
      pricePerLinft: 0,
    };

    const screen = render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="test-multi"
        displayMode="linft"
        customer="Test Co"
        onCreateOrders={() => {}}
      />,
    );

    // product48a target price: 42.67
    const price48a = screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh');
    await expect.element(price48a).toBeVisible();
    await expect.element(price48a).toHaveValue(42.67);

    // product48b target price: Math.ceil((20 / 0.70) * 100) / 100 = 28.58
    const price48b = screen.getByLabelText('Sell price for 2x4 Welded Wire Mesh');
    await expect.element(price48b).toBeVisible();
    await expect.element(price48b).toHaveValue(28.58);
  });
});
