import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import { page } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import { BundleCardBase } from '../../src/components/order-entry/BundleCardBase';
import type { Bundle, Product } from 'core';

// --- Helpers ---

const makeProduct = (
  id: string,
  name: string,
  sku: string,
  costPerEach: number,
  widthInches = 48,
  lengthInches = 120,
): Product => ({
  id,
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name,
    sku,
    material: 'Galvanized Steel',
    width_inches: widthInches,
    length_inches: lengthInches,
    weight_per_sqft: 0.58,
    cost_per_each: costPerEach,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
  },
});

const makeBundle = (
  items: Array<{ product: Product; quantity: number }>,
  overage: number,
): Bundle => {
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
    overage,
    overageUnit: 'linft',
    costTotal,
    pricePerSqft: totalSqft === 0 ? 0 : costTotal / totalSqft,
    pricePerLinft: totalLinft === 0 ? 0 : costTotal / totalLinft,
  };
};

const noopCreateOrders = () => {};

const productA = makeProduct('prod-a', 'Alpha Mesh', 'SKU-A', 32.0);
const productB = makeProduct('prod-b', 'Beta Mesh', 'SKU-B', 20.0);

// --- Tests ---

describe('Linft bundle card shows total delivered length alongside overage', () => {
  test('linft bundle with overage shows "X ft delivered — Y ft overage"', async () => {
    // 20 rolls * 10 ft = 200 ft totalLinft, overage = 5 (already in linft)
    const bundle = makeBundle([{ product: productA, quantity: 20 }], 5);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="test-overage"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
      />,
    );

    await expect.element(page.getByText(/200 ft delivered/)).toBeVisible();
    await expect.element(page.getByText(/5 ft overage/)).toBeVisible();
  });

  test('linft bundle with no overage shows "X ft delivered — no waste"', async () => {
    const bundle = makeBundle([{ product: productA, quantity: 20 }], 0);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="test-no-waste"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
      />,
    );

    await expect.element(page.getByText(/200 ft delivered/)).toBeVisible();
    await expect.element(page.getByText(/no waste/)).toBeVisible();
  });
});

describe('Pill badges explanatory sub-text', () => {
  test('explanatory text appears when at least one pill is visible', async () => {
    const bundleA = makeBundle([{ product: productA, quantity: 20 }], 0);
    const bundleB = makeBundle([{ product: productB, quantity: 20 }], 2);

    render(
      <div>
        <BundleCardBase
          bundle={bundleA}
          bundleKey="card-a"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={false}
          isLeastWaste={true}
        />
        <BundleCardBase
          bundle={bundleB}
          bundleKey="card-b"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={true}
          isLeastWaste={false}
        />
      </div>,
    );

    // Verify pills are shown
    await expect.element(page.getByText('Best Margin', { exact: true })).toBeVisible();
    await expect.element(page.getByText('Least Waste', { exact: true })).toBeVisible();

    // Verify explanatory text appears below pill rows
    const explanations = await page
      .getByText(/Best Margin = lowest cost bundle.*Least Waste = least overage/)
      .all();
    expect(explanations.length).toBeGreaterThanOrEqual(1);
  });

  test('explanatory text does NOT appear when no pills are visible', async () => {
    const bundle = makeBundle([{ product: productA, quantity: 20 }], 0);

    render(
      <BundleCardBase
        bundle={bundle}
        bundleKey="no-pills"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
        isBestMargin={false}
        isLeastWaste={false}
      />,
    );

    await expect
      .element(page.getByText('Best Margin = lowest cost bundle'))
      .not.toBeInTheDocument();
  });
});

describe('OrderEntry — linft bundle delivered length (integration)', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('linft bundle card with overage shows "X ft delivered — Y ft overage" text', async () => {
    // product48a: 10 ft roll, 48" wide
    const product48a: Product = {
      id: 'prod-48a',
      created_at: '2024-01-01T00:00:00Z',
      properties: {
        name: '4x4 Welded Wire Mesh',
        sku: 'WM-48-10FT',
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

    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);

    // Switch to Search by UoM
    await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();
    await screen.getByRole('button', { name: 'Search by UoM' }).click();

    // 205 ft requested, 10 ft per roll -> 21 rolls, 210 ft delivered, 5 ft overage
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('205');

    await expect.element(screen.getByText(/210 ft delivered/)).toBeVisible();
    await expect.element(screen.getByText(/5 ft overage/)).toBeVisible();
  });
});
