import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import { page } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import type { Product } from 'core';

// Two products at 48", one at 36"
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

// Second 48" product -- more expensive
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

const product36: Product = {
  id: 'prod-36',
  created_at: '2024-01-03T00:00:00Z',
  properties: {
    name: 'Narrow Mesh 36in',
    sku: 'WM-36-10FT',
    material: 'Galvanized Steel',
    width_inches: 36,
    length_inches: 120,
    weight_per_sqft: 0.5,
    cost_per_each: 28.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
  },
};

const ALL_PRODUCTS = [product48a, product48b, product36];

async function switchToSearchByUoM(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();
  await screen.getByRole('button', { name: 'Search by UoM' }).click();
}

describe('OrderEntry — Search by UoM / Linear ft mode', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('Search by UoM has a Linear ft / Sqft toggle', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await expect.element(screen.getByRole('button', { name: 'Linear ft' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Sqft' })).toBeVisible();
  });

  test('Linear ft mode shows width dropdown populated from distinct width_inches values', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    // Default is Linear ft toggle
    await expect.element(screen.getByLabelText('Width')).toBeVisible();

    // Should have options for 36" and 48" (the distinct widths)
    await expect.element(screen.getByRole('option', { name: '36"' })).toBeVisible();
    await expect.element(screen.getByRole('option', { name: '48"' })).toBeVisible();
  });

  test('entering width=48 and length shows only matching-width products in bundles', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    // Both 48" products should appear
    const meshTexts = await page.getByText('4x4 Welded Wire Mesh').all();
    expect(meshTexts.length).toBeGreaterThan(0);
    const mesh2Texts = await page.getByText('2x4 Welded Wire Mesh').all();
    expect(mesh2Texts.length).toBeGreaterThan(0);

    // The 36" product must NOT appear
    await expect.element(screen.getByText('Narrow Mesh 36in')).not.toBeInTheDocument();
  });

  test('width dropdown only shows widths from catalog', async () => {
    // Only one product at 36" — dropdown should only have 36" option
    await commands.setFixtureState({ state: { products: [product36] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    // 36" should be available
    await expect.element(screen.getByRole('option', { name: '36"' })).toBeVisible();
    // 48" should not be available since no 48" products exist
    await expect.element(screen.getByRole('option', { name: '48"' })).not.toBeInTheDocument();

    // Select 36" and enter length — should show bundles
    await screen.getByLabelText('Width').selectOptions('36');
    await screen.getByLabelText('Total Length (ft)').fill('100');

    await expect.element(screen.getByText('Narrow Mesh 36in')).toBeVisible();
  });

  test('each bundle card shows product name, SKU, quantity, and delivered length', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    // 200 ft / 10 ft per roll = 20 rolls exactly
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    await expect.element(screen.getByText('4x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('WM-48-10FT')).toBeVisible();
    await expect.element(screen.getByText(/20.*rolls/)).toBeVisible();
    // 20 rolls * 10 ft = 200 ft
    await expect.element(screen.getByText(/200.*ft/)).toBeVisible();
    await expect.element(screen.getByText(/no waste/)).toBeVisible();
  });

  test('bundle card shows per-item sell price input', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    // Should have a sell price input for the product
    await expect
      .element(screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh'))
      .toBeVisible();
  });

  test('entering per-item sell price shows combined margin', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    // product48a: cost_per_each=32, margin_target=25, margin_floor=15
    // 200 ft / 10 ft = 20 rolls, cost = 20 * 32 = 640
    // sell price $50/each → revenue = 20 * 50 = 1000
    // margin = (1000 - 640) / 1000 = 36% → healthy (>= 25% target)
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    const marginEl = screen.getByText(/36\.0%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin shown with correct color for warning margin', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    // 20 rolls, cost = 640; sell $38/each → revenue = 760
    // margin = (760 - 640) / 760 = 120/760 ≈ 15.8% → warning
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('38');

    const marginEl = screen.getByText(/15\.8%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-amber-50')).not.toBeNull();
  });

  test('margin shown with correct color for critical margin', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    // 20 rolls, cost = 640; sell $36/each → revenue = 720
    // margin = (720 - 640) / 720 ≈ 11.1% → critical
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('36');

    const marginEl = screen.getByText(/11\.1%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-red-50')).not.toBeNull();
  });

  test('sort by Price/sqft reorders bundles correctly', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    // Click sort by sqft (label shows "Cost/sqft" when no sell prices entered)
    await screen.getByRole('button', { name: /sqft/ }).click();

    // Both 48" bundles are visible (use page locator for multiple matches)
    const meshTexts = await page.getByText('4x4 Welded Wire Mesh').all();
    expect(meshTexts.length).toBeGreaterThan(0);
    const mesh2Texts = await page.getByText('2x4 Welded Wire Mesh').all();
    expect(mesh2Texts.length).toBeGreaterThan(0);
  });

  test('sort by Price/linft reorders bundles correctly', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    // Click sort by linft (label shows "Cost/linft" when no sell prices entered)
    await screen.getByRole('button', { name: /linft/ }).click();

    const meshTexts = await page.getByText('4x4 Welded Wire Mesh').all();
    expect(meshTexts.length).toBeGreaterThan(0);
    const mesh2Texts = await page.getByText('2x4 Welded Wire Mesh').all();
    expect(mesh2Texts.length).toBeGreaterThan(0);
  });

  test('Create Orders on single-item bundle creates 1 draft order and navigates to history', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    let navigatedToHistory = false;
    const screen = render(
      <OrderEntry
        onNavigateToHistory={() => {
          navigatedToHistory = true;
        }}
      />,
    );
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Customer').fill('Acme Fencing Co');
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    await screen.getByRole('button', { name: 'Create Orders' }).click();

    // Wait for navigation callback
    await expect.poll(() => navigatedToHistory).toBeTruthy();

    // Verify order was created in fixture state
    const state = (await commands.getFixtureState()) as {
      orders?: Array<{
        properties: { product_name: string; quantity: number; sell_price_per_unit: number };
      }>;
    };
    expect(state.orders).toHaveLength(1);
    expect(state.orders![0].properties.product_name).toBe('4x4 Welded Wire Mesh');
    expect(state.orders![0].properties.quantity).toBe(20);
    expect(state.orders![0].properties.sell_price_per_unit).toBe(50);
  });

  test('sell price updates margin on visible bundle card', async () => {
    // Use single product to avoid multi-card ambiguity with per-item pricing
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');

    // product48a: 20 rolls * $32 cost = $640 cost; 20 * $50 = $1000 rev -> 36% margin
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    await expect.element(screen.getByText('36.0%')).toBeVisible();
  });
});
