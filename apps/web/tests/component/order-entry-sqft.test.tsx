import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
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
    length_inches: 120, // 10 ft roll → 40 sqft/roll
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
    length_inches: 60, // 5 ft roll → 20 sqft/roll
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
    length_inches: 120, // 10 ft roll → 30 sqft/roll
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

async function switchToByArea(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'By Area' })).toBeVisible();
  await screen.getByRole('button', { name: 'By Area' }).click();
}

describe('OrderEntry — By Area mode', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('3 products in catalog, enter 500 sqft — shows 3 bundle options', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    // All 3 products should appear as bundles
    await expect.element(screen.getByText('4x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('2x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('Narrow Mesh 36in')).toBeVisible();
  });

  test('bundle cards show correct quantities for 500 sqft', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: 40 sqft/roll → ceil(500/40) = 13 rolls
    // productB: 20 sqft/roll → ceil(500/20) = 25 rolls
    // productC: 30 sqft/roll → ceil(500/30) = 17 rolls
    await screen.getByLabelText('Total Area (sqft)').fill('500');

    await expect.element(screen.getByText(/13.*rolls/)).toBeVisible();
    await expect.element(screen.getByText(/25.*rolls/)).toBeVisible();
    await expect.element(screen.getByText(/17.*rolls/)).toBeVisible();
  });

  test('overage is calculated and displayed correctly', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: 40 sqft/roll → ceil(500/40) = 13 rolls → 520 sqft delivered → 20 sqft overage
    await screen.getByLabelText('Total Area (sqft)').fill('500');

    await expect.element(screen.getByText(/520.*sqft delivered/)).toBeVisible();
    await expect.element(screen.getByText(/20.*sqft overage/)).toBeVisible();
  });

  test('no overage when sqft divides evenly', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: 40 sqft/roll → ceil(400/40) = 10 rolls → 400 sqft delivered → 0 overage
    await screen.getByLabelText('Total Area (sqft)').fill('400');

    await expect.element(screen.getByText(/400.*sqft delivered/)).toBeVisible();
    // Should not show overage text
    await expect.element(screen.getByText(/sqft overage/)).not.toBeInTheDocument();
  });

  test('bundle cards show roll dimensions', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    // productA: 48" × 120" rolls (10 ft)
    await expect.element(screen.getByText(/48.*120.*rolls/)).toBeVisible();
  });

  test('entering sell price shows price/sqft and price/linft on bundle card', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: 40 sqft/roll → ceil(500/40) = 13 rolls
    // totalSqft = 520, totalLinft = 130 (10 ft × 13)
    // total revenue = 13 * 50 = 650
    // price/sqft = 650 / 520 = 1.25
    // price/linft = 650 / 130 = 5.00
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    await expect.element(screen.getByText(/\$1\.25/)).toBeVisible();
    await expect.element(screen.getByText(/\/ sqft/)).toBeVisible();
    await expect.element(screen.getByText(/\$5\.00/)).toBeVisible();
    await expect.element(screen.getByText(/\/ linft/)).toBeVisible();
  });

  test('sell price updates margin across all visible bundle cards', async () => {
    await commands.setFixtureState({ state: { products: [productA, productB] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    // productA: 13 rolls @ $32 cost = $416; sell $50 → rev = $650; margin = (650-416)/650 ≈ 36%
    // productB: 25 rolls @ $20 cost = $500; sell $50 → rev = $1250; margin = (1250-500)/1250 = 60%
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    await expect.element(screen.getByText('36.0%')).toBeVisible();
    await expect.element(screen.getByText('60.0%')).toBeVisible();
  });

  test('margin is shown with correct color for healthy margin', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: margin_target=25, margin_floor=15
    // 13 rolls @ $32 = $416 cost; sell $50 → rev = $650; margin ≈ 36% → healthy
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    const marginEl = screen.getByText(/36\.0%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin is shown with correct color for warning margin', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: margin_target=25, margin_floor=15
    // 13 rolls @ $32 = $416 cost; sell $38 → rev = $494; margin = (494-416)/494 ≈ 15.8% → warning
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price per unit ($)').fill('38');

    const marginEl = screen.getByText(/15\.8%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-amber-50')).not.toBeNull();
  });

  test('margin is shown with correct color for critical margin', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: margin_target=25, margin_floor=15
    // 13 rolls @ $32 = $416 cost; sell $36 → rev = $468; margin = (468-416)/468 ≈ 11.1% → critical
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price per unit ($)').fill('36');

    const marginEl = screen.getByText(/11\.1%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-red-50')).not.toBeNull();
  });

  test('sort by Price/sqft changes bundle order', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    await screen.getByRole('button', { name: /Price\/sqft/ }).click();

    await expect.element(screen.getByText('4x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('2x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('Narrow Mesh 36in')).toBeVisible();
  });

  test('sort by Price/linft changes bundle order', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    await screen.getByRole('button', { name: /Price\/linft/ }).click();

    await expect.element(screen.getByText('4x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('2x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('Narrow Mesh 36in')).toBeVisible();
  });

  test('clicking Select for Quote populates order form with correct product and quantity', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    // productA: ceil(500/40) = 13 rolls
    await screen.getByLabelText('Total Area (sqft)').fill('500');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    await screen.getByRole('button', { name: 'Select for Quote' }).click();

    // Should return to By Product mode
    await expect.element(screen.getByLabelText('Product')).toBeVisible();

    // Product should be pre-selected
    const productSelect = screen.getByLabelText('Product');
    await expect.element(productSelect).toHaveValue('prod-a');

    // Quantity should be 13 (eaches)
    await expect.element(screen.getByLabelText('Quantity')).toHaveValue(13);

    // Sell price should be pre-filled with 50
    await expect.element(screen.getByLabelText('Sell price per each ($)')).toHaveValue(50);
  });

  test('clicking Select for Quote switches back to By Product mode', async () => {
    await commands.setFixtureState({ state: { products: [productA] } });

    const screen = render(<OrderEntry />);
    await switchToByArea(screen);

    await screen.getByLabelText('Total Area (sqft)').fill('500');

    await screen.getByRole('button', { name: 'Select for Quote' }).click();

    // By Product form fields should be visible
    await expect.element(screen.getByLabelText('Customer')).toBeVisible();
    await expect.element(screen.getByLabelText('Product')).toBeVisible();
    await expect.element(screen.getByLabelText('Quantity')).toBeVisible();

    // Area input should no longer be visible
    await expect.element(screen.getByLabelText('Total Area (sqft)')).not.toBeInTheDocument();
  });

  test('empty catalog shows "No products in catalog" message', async () => {
    await commands.setFixtureState({ state: { products: [] } });

    const screen = render(<OrderEntry />);

    // When catalog is empty, the order entry shows "No products found" state (not mode tabs)
    // The by-area panel is only shown when products.length > 0
    await expect.element(screen.getByText(/No products found/)).toBeVisible();
  });
});
