import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import { page } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import { BundleCardBase } from '../../src/components/order-entry/BundleCardBase';
import type { Product, Bundle } from 'core';

const fixtureProduct: Product = {
  id: 'prod-1',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: '4x4 Welded Wire Mesh',
    sku: 'WM-4X4-10GA',
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
  },
};

// length_inches=120 => 10 ft per roll
// 3 rolls => totalDeliveredFt = 30 ft
const makeLinftBundle = (quantity: number, overage: number): Bundle => ({
  items: [{ product: fixtureProduct, quantity }],
  totalSqft: quantity * 40,
  totalLinft: quantity * 10,
  overage,
  overageUnit: 'linft',
  costTotal: quantity * 32,
  pricePerSqft: 32 / 40,
  pricePerLinft: 32 / 10,
});

describe('OrderEntry UX polish — shared customer state', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('customer typed in Specific Product mode persists when switching to Search by UoM', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    render(<OrderEntry />);

    // Type customer name in Specific Product mode (default mode)
    await page.getByLabel('Customer').fill('Acme Fencing Co');

    // Switch to Search by UoM tab
    await page.getByRole('button', { name: 'Search by UoM' }).click();

    // Customer field in Search by UoM panel should retain the value
    await expect.element(page.getByLabel('Customer')).toHaveValue('Acme Fencing Co');
  });
});

describe('OrderEntry UX polish — linft overage display', () => {
  test('linft bundle card with no overage shows "X ft delivered — no waste"', async () => {
    // 3 rolls × 10 ft = 30 ft delivered, overage=0
    const bundle = makeLinftBundle(3, 0);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="test-no-overage"
        displayMode="linft"
        customer=""
        onCreateOrders={() => {}}
      />,
    );

    await expect.element(page.getByText('30 ft delivered — no waste')).toBeVisible();
  });

  test('linft bundle card with overage shows "X ft delivered — Y ft overage"', async () => {
    // 3 rolls × 10 ft = 30 ft delivered
    // overage = 5 sqft; width=48" => overageLinft = 5 / (48/12) = 5 / 4 = 1.25 ft
    const bundle = makeLinftBundle(3, 5);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="test-with-overage"
        displayMode="linft"
        customer=""
        onCreateOrders={() => {}}
      />,
    );

    await expect.element(page.getByText(/30 ft delivered — 1\.3 ft overage/)).toBeVisible();
  });
});

describe('OrderEntry UX polish — pill badge explanatory text', () => {
  test('explanatory text appears when at least one pill badge is shown', async () => {
    const bundle = makeLinftBundle(5, 0);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="test-pill-text"
        displayMode="linft"
        customer=""
        onCreateOrders={() => {}}
        isBestMargin={true}
        isLeastWaste={false}
      />,
    );

    await expect
      .element(page.getByText('Best Margin = lowest cost bundle · Least Waste = least overage'))
      .toBeVisible();
  });

  test('explanatory text does not appear when no pill badges are shown', async () => {
    const bundle = makeLinftBundle(5, 0);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="test-no-pill-text"
        displayMode="linft"
        customer=""
        onCreateOrders={() => {}}
        isBestMargin={false}
        isLeastWaste={false}
      />,
    );

    await expect
      .element(page.getByText('Best Margin = lowest cost bundle · Least Waste = least overage'))
      .not.toBeInTheDocument();
  });
});
