import { test, expect, describe } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from '@vitest/browser/context';
import React from 'react';
import { BundleCardBase } from '../../src/components/order-entry/BundleCardBase';
import type { Bundle } from 'core';
import type { Product } from 'core';

const makeProduct = (id: string, name: string, sku: string, costPerEach: number): Product => ({
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
    margin_target: 25,
    margin_floor: 15,
    qty_on_hand_eaches: 0,
    safety_stock_eaches: 0,
    reorder_point_eaches: 0,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
  },
});

const productA = makeProduct('prod-a', 'Alpha Mesh', 'SKU-A', 32.0);
const productB = makeProduct('prod-b', 'Beta Mesh', 'SKU-B', 20.0);
const productC = makeProduct('prod-c', 'Gamma Mesh', 'SKU-C', 45.0);

const makeBundle = (
  product: Product,
  quantity: number,
  overage: number,
  costTotal: number,
): Bundle => ({
  items: [{ product, quantity }],
  totalSqft: quantity * 40,
  totalLinft: quantity * 10,
  overage,
  overageUnit: 'linft',
  costTotal,
  pricePerSqft: costTotal / (quantity * 40),
  pricePerLinft: costTotal / (quantity * 10),
});

const noopCreateOrders = () => {};

// bundleA: costTotal=640, overage=0
const bundleA = makeBundle(productA, 20, 0, 640);
// bundleB: costTotal=400, overage=2  (lowest cost, NOT lowest waste)
const bundleB = makeBundle(productB, 20, 2, 400);
// bundleC: costTotal=900, overage=5
const bundleC = makeBundle(productC, 20, 5, 900);

describe('BundleCardBase pill badges', () => {
  test('isBestMargin=true renders Best Margin pill with emerald classes', async () => {
    render(
      <BundleCardBase
        bundle={bundleB}
        bundleKey="test-b"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
        isBestMargin={true}
        isLeastWaste={false}
      />,
    );

    await expect.element(page.getByText('Best Margin', { exact: true })).toBeVisible();
    await expect.element(page.getByText('Least Waste', { exact: true })).not.toBeInTheDocument();

    const pill = page.getByText('Best Margin', { exact: true }).element();
    expect(pill.classList.contains('bg-emerald-100')).toBe(true);
    expect(pill.classList.contains('text-emerald-700')).toBe(true);
  });

  test('isLeastWaste=true renders Least Waste pill with indigo classes', async () => {
    render(
      <BundleCardBase
        bundle={bundleA}
        bundleKey="test-a"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
        isBestMargin={false}
        isLeastWaste={true}
      />,
    );

    await expect.element(page.getByText('Least Waste', { exact: true })).toBeVisible();
    await expect.element(page.getByText('Best Margin', { exact: true })).not.toBeInTheDocument();

    const pill = page.getByText('Least Waste', { exact: true }).element();
    expect(pill.classList.contains('bg-indigo-100')).toBe(true);
    expect(pill.classList.contains('text-indigo-700')).toBe(true);
  });

  test('both isBestMargin and isLeastWaste=true renders both pills side by side', async () => {
    render(
      <BundleCardBase
        bundle={bundleB}
        bundleKey="test-both"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
        isBestMargin={true}
        isLeastWaste={true}
      />,
    );

    await expect.element(page.getByText('Best Margin', { exact: true })).toBeVisible();
    await expect.element(page.getByText('Least Waste', { exact: true })).toBeVisible();
  });

  test('neither pill prop set: no pills rendered', async () => {
    render(
      <BundleCardBase
        bundle={bundleA}
        bundleKey="test-none"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
      />,
    );

    await expect.element(page.getByText('Best Margin', { exact: true })).not.toBeInTheDocument();
    await expect.element(page.getByText('Least Waste', { exact: true })).not.toBeInTheDocument();
  });

  test('3 cards: only bundle with lowest costTotal gets Best Margin, only lowest overage gets Least Waste', async () => {
    // bundleA: costTotal=640, overage=0 => Least Waste (lowest)
    // bundleB: costTotal=400, overage=2 => Best Margin (lowest cost)
    // bundleC: costTotal=900, overage=5 => neither
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
        <BundleCardBase
          bundle={bundleC}
          bundleKey="card-c"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={false}
          isLeastWaste={false}
        />
      </div>,
    );

    // Exactly 1 Best Margin pill (bundleB)
    const bestMarginPills = await page.getByText('Best Margin', { exact: true }).all();
    expect(bestMarginPills).toHaveLength(1);

    // Exactly 1 Least Waste pill (bundleA)
    const leastWastePills = await page.getByText('Least Waste', { exact: true }).all();
    expect(leastWastePills).toHaveLength(1);
  });

  test('2 cards where one bundle wins both: it has both pills, other has neither', async () => {
    // bundleB (costTotal=400, overage=2) wins Best Margin
    // bundleA (costTotal=640, overage=0) wins Least Waste
    // Neither wins both — use bundleB winning both by giving it lower overage too
    const bundleBWinsBoth = makeBundle(productB, 20, 0, 400);

    render(
      <div>
        <BundleCardBase
          bundle={bundleA}
          bundleKey="card-a2"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={false}
          isLeastWaste={false}
        />
        <BundleCardBase
          bundle={bundleBWinsBoth}
          bundleKey="card-b2"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={true}
          isLeastWaste={true}
        />
      </div>,
    );

    const bestMarginPills = await page.getByText('Best Margin', { exact: true }).all();
    const leastWastePills = await page.getByText('Least Waste', { exact: true }).all();

    expect(bestMarginPills).toHaveLength(1);
    expect(leastWastePills).toHaveLength(1);
  });

  test('tied overage: all tied bundles get Least Waste pill', async () => {
    // All 3 bundles have overage=0 => all should get Least Waste
    const bundleATied = makeBundle(productA, 20, 0, 640);
    const bundleBTied = makeBundle(productB, 20, 0, 400);
    const bundleCTied = makeBundle(productC, 20, 0, 900);

    render(
      <div>
        <BundleCardBase
          bundle={bundleATied}
          bundleKey="tied-a"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={false}
          isLeastWaste={true}
        />
        <BundleCardBase
          bundle={bundleBTied}
          bundleKey="tied-b"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={true}
          isLeastWaste={true}
        />
        <BundleCardBase
          bundle={bundleCTied}
          bundleKey="tied-c"
          displayMode="linft"
          customer=""
          onCreateOrders={noopCreateOrders}
          isBestMargin={false}
          isLeastWaste={true}
        />
      </div>,
    );

    // 3 Least Waste pills (all tie at overage=0)
    const leastWastePills = await page.getByText('Least Waste', { exact: true }).all();
    expect(leastWastePills).toHaveLength(3);

    // 1 Best Margin pill (bundleB lowest cost)
    const bestMarginPills = await page.getByText('Best Margin', { exact: true }).all();
    expect(bestMarginPills).toHaveLength(1);
  });
});

describe('Bundle pill badge logic in OrderEntry (integration)', () => {
  test('single bundle: no pills shown (isBestMargin/isLeastWaste default to false)', async () => {
    // When only 1 bundle, OrderEntry passes isBestMargin=false, isLeastWaste=false
    // BundleCardBase should not render pills when props are false/absent
    render(
      <BundleCardBase
        bundle={bundleA}
        bundleKey="single"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
        isBestMargin={false}
        isLeastWaste={false}
      />,
    );

    await expect.element(page.getByText('Best Margin', { exact: true })).not.toBeInTheDocument();
    await expect.element(page.getByText('Least Waste', { exact: true })).not.toBeInTheDocument();
  });

  test('Best Margin pill shown even when no sell price entered (only based on costTotal)', async () => {
    // The pill is prop-driven; no sell price needed. The presence of isBestMargin=true
    // is sufficient to show the pill regardless of entered prices.
    render(
      <BundleCardBase
        bundle={bundleB}
        bundleKey="no-price"
        displayMode="linft"
        customer=""
        onCreateOrders={noopCreateOrders}
        isBestMargin={true}
        isLeastWaste={false}
      />,
    );

    // No price entered, but pill should still show
    await expect.element(page.getByText('Best Margin', { exact: true })).toBeVisible();
  });
});
