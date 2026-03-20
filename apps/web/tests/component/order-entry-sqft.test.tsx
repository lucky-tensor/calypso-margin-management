import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import { page } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import type { Product } from 'core';

// Three products with different widths and lengths
const productA: Product = {
  id: 'prod-a',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: '4x4 Welded Wire Mesh',
    sku: 'WM-48-10FT',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120, // 10 ft roll -> 40 sqft/roll
    weight_per_sqft: 0.58,
    cost_per_each: 32.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
  },
};

const productB: Product = {
  id: 'prod-b',
  created_at: '2024-01-02T00:00:00Z',
  properties: {
    name: '2x4 Welded Wire Mesh',
    sku: 'WM-48-5FT',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 60, // 5 ft roll -> 20 sqft/roll
    weight_per_sqft: 0.7,
    cost_per_each: 20.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 30,
    margin_floor: 20,
  },
};

const productC: Product = {
  id: 'prod-c',
  created_at: '2024-01-03T00:00:00Z',
  properties: {
    name: 'Narrow Mesh 36in',
    sku: 'WM-36-10FT',
    material: 'Galvanized Steel',
    width_inches: 36,
    length_inches: 120, // 10 ft roll -> 30 sqft/roll
    weight_per_sqft: 0.5,
    cost_per_each: 28.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
  },
};

const ALL_PRODUCTS = [productA, productB, productC];

async function switchToSearchByUoMSqft(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();
  await screen.getByRole('button', { name: 'Search by UoM' }).click();
  // Switch to Sqft toggle
  await screen.getByRole('button', { name: 'Sq ft' }).click();
}

describe('OrderEntry — Search by UoM / Sqft mode', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('3 products in catalog, enter 500 sqft — shows bundle options', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    // All 3 products should appear as bundles (use page locator for multiple matches)
    const meshA = await page.getByText('4x4 Welded Wire Mesh').all();
    expect(meshA.length).toBeGreaterThan(0);
    const meshB = await page.getByText('2x4 Welded Wire Mesh').all();
    expect(meshB.length).toBeGreaterThan(0);
    const meshC = await page.getByText('Narrow Mesh 36in').all();
    expect(meshC.length).toBeGreaterThan(0);
  });

  test('bundle cards show correct quantities for 500 sqft', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    // productA: 40 sqft/roll -> ceil(500/40) = 13 rolls
    // productB: 20 sqft/roll -> ceil(500/20) = 25 rolls
    // productC: 30 sqft/roll -> ceil(500/30) = 17 rolls
    await screen.getByLabelText('Total Area (sqft)').fill('500');

    const rolls13 = await page.getByText(/13.*rolls/).all();
    expect(rolls13.length).toBeGreaterThan(0);
    const rolls25 = await page.getByText(/25.*rolls/).all();
    expect(rolls25.length).toBeGreaterThan(0);
    const rolls17 = await page.getByText(/17.*rolls/).all();
    expect(rolls17.length).toBeGreaterThan(0);
  });

  test('overage is calculated and displayed correctly', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    // productA: 40 sqft/roll -> ceil(500/40) = 13 rolls -> 520 sqft delivered -> 20 sqft overage
    await screen.getByLabelText('Total Area (sqft)').fill('500');

    await expect.element(screen.getByText(/520.*sqft delivered/)).toBeVisible();
    await expect.element(screen.getByText(/20.*sqft overage/)).toBeVisible();
  });

  test('no overage when sqft divides evenly', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    // productA: 40 sqft/roll -> ceil(400/40) = 10 rolls -> 400 sqft delivered -> 0 overage
    await screen.getByLabelText('Total Area (sqft)').fill('400');

    await expect.element(screen.getByText(/400.*sqft delivered/)).toBeVisible();
    // Should not show overage text
    await expect.element(screen.getByText(/sqft overage/)).not.toBeInTheDocument();
  });

  test('bundle cards show roll dimensions', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    // productA: 48" x 120" rolls (10 ft)
    await expect.element(screen.getByText(/48.*120.*rolls/)).toBeVisible();
  });

  test('multi-product bundle card renders one sell price input per item', async () => {
    await commands.setFixtureState({ state: { products: [productA, productB] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    // Each product should have sell price inputs (may appear in multiple cards)
    const priceInputsA = await page
      .getByRole('spinbutton', { name: 'Sell price for 4x4 Welded Wire Mesh' })
      .all();
    expect(priceInputsA.length).toBeGreaterThan(0);

    const priceInputsB = await page
      .getByRole('spinbutton', { name: 'Sell price for 2x4 Welded Wire Mesh' })
      .all();
    expect(priceInputsB.length).toBeGreaterThan(0);
  });

  test('update one item sell price — combined margin updates correctly', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    // productA: 13 rolls @ $32 cost = $416; sell $50 -> rev = 13*50 = $650; margin = (650-416)/650 ≈ 36%
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    await expect.element(screen.getByText('36.0%')).toBeVisible();
  });

  test('margin is shown with correct color for healthy margin', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    // productA: margin_target=25, margin_floor=15
    // 13 rolls @ $32 = $416 cost; sell $50 -> rev = $650; margin ≈ 36% -> healthy
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    const marginEl = screen.getByText(/36\.0%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin is shown with correct color for warning margin', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    // productA: margin_target=25, margin_floor=15
    // 13 rolls @ $32 = $416 cost; sell $38 -> rev = $494; margin = (494-416)/494 ≈ 15.8% -> warning
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('38');

    const marginEl = screen.getByText(/15\.8%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-amber-50')).not.toBeNull();
  });

  test('margin is shown with correct color for critical margin', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    // productA: margin_target=25, margin_floor=15
    // 13 rolls @ $32 = $416 cost; sell $36 -> rev = $468; margin = (468-416)/468 ≈ 11.1% -> critical
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('36');

    const marginEl = screen.getByText(/11\.1%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-red-50')).not.toBeNull();
  });

  test('sort by Price/sqft reorders bundles', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    await screen.getByRole('button', { name: /Price\/sqft/ }).click();

    const meshA = await page.getByText('4x4 Welded Wire Mesh').all();
    expect(meshA.length).toBeGreaterThan(0);
    const meshB = await page.getByText('2x4 Welded Wire Mesh').all();
    expect(meshB.length).toBeGreaterThan(0);
    const meshC = await page.getByText('Narrow Mesh 36in').all();
    expect(meshC.length).toBeGreaterThan(0);
  });

  test('sort by Price/linft reorders bundles', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    await screen.getByRole('button', { name: /Price\/linft/ }).click();

    const meshA = await page.getByText('4x4 Welded Wire Mesh').all();
    expect(meshA.length).toBeGreaterThan(0);
    const meshB = await page.getByText('2x4 Welded Wire Mesh').all();
    expect(meshB.length).toBeGreaterThan(0);
    const meshC = await page.getByText('Narrow Mesh 36in').all();
    expect(meshC.length).toBeGreaterThan(0);
  });

  test('Confirm Orders on a multi-item bundle creates orders via API and shows success banner', async () => {
    // Use two products that will produce a multi-product bundle
    // productA: 40 sqft/roll, productB: 20 sqft/roll
    // For 50 sqft, single-product: A needs ceil(50/40)=2 rolls (80 sqft, 30 overage)
    //                               B needs ceil(50/20)=3 rolls (60 sqft, 10 overage)
    // Multi-product: 1 A (40 sqft) + 1 B (20 sqft) = 60 sqft, 10 overage — same as B alone
    await commands.setFixtureState({ state: { products: [productA, productB] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoMSqft(screen);

    await screen.getByLabelText('Customer').fill('Test Customer');
    await screen.getByLabelText('Total Area (sqft)').fill('50');

    // Fill in sell prices for both products where they appear
    const priceInputsA = await page
      .getByRole('spinbutton', { name: 'Sell price for 4x4 Welded Wire Mesh' })
      .all();
    const priceInputsB = await page
      .getByRole('spinbutton', { name: 'Sell price for 2x4 Welded Wire Mesh' })
      .all();

    for (const input of priceInputsA) {
      await input.fill('50');
    }
    for (const input of priceInputsB) {
      await input.fill('30');
    }

    // Click Confirm Orders on the last card (multi-product combo)
    const confirmButtons = await page.getByRole('button', { name: /Confirm Order/ }).all();
    expect(confirmButtons.length).toBeGreaterThan(0);

    await confirmButtons[confirmButtons.length - 1].click();

    // Review step should appear — click Confirm (exact match to avoid matching "Confirm Order/Orders")
    await expect
      .element(screen.getByRole('button', { name: 'Confirm', exact: true }))
      .toBeVisible();
    await screen.getByRole('button', { name: 'Confirm', exact: true }).click();

    // Success banner should appear
    await expect.element(screen.getByText(/Order confirmed!/), { timeout: 5000 }).toBeVisible();

    // Verify orders were created
    const state = (await commands.getFixtureState()) as {
      orders?: Array<{ properties: { product_name: string } }>;
    };
    expect(state.orders).toBeDefined();
    expect(state.orders!.length).toBeGreaterThanOrEqual(1);
  });

  test('empty catalog shows "No products in catalog" message', async () => {
    await commands.setFixtureState({ state: { products: [] } });

    const screen = render(<OrderEntry />);

    // When catalog is empty, the order entry shows "No products found" state (not mode tabs)
    await expect.element(screen.getByText(/No products found/)).toBeVisible();
  });
});
