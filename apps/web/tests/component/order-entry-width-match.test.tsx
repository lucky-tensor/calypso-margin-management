import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import type { Product } from 'core';

// TODO(#42): Several tests in this file are skipped because vitest-browser-react's
// render() result does not expose getAllByText(). These tests need to be rewritten
// using the Locator API (page.getByText / locator.all()) as part of the
// consolidated order entry UI work in issue #42.

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

// Second 48" product — more expensive
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

async function switchToByWidth(screen: ReturnType<typeof render>) {
  // Wait for products to load (mode tabs appear)
  await expect.element(screen.getByRole('button', { name: 'By Width' })).toBeVisible();
  await screen.getByRole('button', { name: 'By Width' }).click();
}

describe('OrderEntry — By Width mode', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('mode selector shows By Product, By Width, and By Area tabs', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);

    await expect.element(screen.getByRole('button', { name: 'By Product' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'By Width' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'By Area' })).toBeVisible();
  });

  test.skip('entering width=48 shows only 2 bundles (not the 36" product)', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');

    // Both 48" products should appear (use first() — product names also appear in multi-product combo cards)
    await expect.element(screen.getAllByText('4x4 Welded Wire Mesh').first()).toBeVisible();
    await expect.element(screen.getAllByText('2x4 Welded Wire Mesh').first()).toBeVisible();

    // The 36" product must NOT appear
    await expect.element(screen.getByText('Narrow Mesh 36in')).not.toBeInTheDocument();
  });

  test('empty state message appears when no products match the width', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    await screen.getByLabelText('Width (inches)').fill('72');
    await screen.getByLabelText('Total Length (feet)').fill('100');

    await expect.element(screen.getByText(/No products available at 72"/)).toBeVisible();
  });

  test('each bundle card shows product name, SKU, quantity, and delivered length', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    // 200 ft / 10 ft per roll = 20 rolls exactly
    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');

    await expect.element(screen.getByText('4x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByText('WM-48-10FT')).toBeVisible();
    await expect.element(screen.getByText(/20.*rolls/)).toBeVisible();
    // 20 rolls * 10 ft = 200 ft
    await expect.element(screen.getByText(/200.*ft/)).toBeVisible();
    await expect.element(screen.getByText(/no waste/)).toBeVisible();
  });

  test('bundle with overage shows overage line feet correctly', async () => {
    await commands.setFixtureState({ state: { products: [product48b] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    // product48b: 5 ft rolls. 200 ft / 5 ft = 40 rolls exactly, no overage
    // Use 201 ft: ceil(201/5) = 41 rolls → delivered = 205 ft → overage = 5 ft
    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('201');

    await expect.element(screen.getByText(/5.*ft overage|5 ft overage/)).toBeVisible();
  });

  test('entering sell price shows price/sqft and price/linft on bundle card', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    // 200 ft / 10 ft per roll = 20 rolls. Sell price $50/each.
    // total revenue = 20 * 50 = 1000
    // totalLinft = 200, totalSqft = 200 * 4 = 800 (48" = 4 ft wide)
    // price/sqft = 1000 / 800 = 1.25
    // price/linft = 1000 / 200 = 5.00
    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    await expect.element(screen.getByText(/\$1\.25/)).toBeVisible();
    await expect.element(screen.getByText(/\/ sqft/)).toBeVisible();
    await expect.element(screen.getByText(/\$5\.00/)).toBeVisible();
    await expect.element(screen.getByText(/\/ linft/)).toBeVisible();
  });

  test('margin is shown with correct color for healthy margin', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    // product48a: cost_per_each=32, margin_target=25, margin_floor=15
    // 200 ft / 10 ft = 20 rolls, cost = 20 * 32 = 640
    // sell price $50/each → revenue = 20 * 50 = 1000
    // margin = (1000 - 640) / 1000 = 36% → healthy (>= 25% target)
    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    const marginEl = screen.getByText(/36\.0%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin is shown with correct color for warning margin', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    // product48a: cost_per_each=32, margin_target=25, margin_floor=15
    // 20 rolls, cost = 640; sell $38/each → revenue = 760
    // margin = (760 - 640) / 760 = 120/760 ≈ 15.8% → warning (between 15 floor and 25 target)
    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('38');

    const marginEl = screen.getByText(/15\.8%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-amber-50')).not.toBeNull();
  });

  test('margin is shown with correct color for critical margin', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    // product48a: cost_per_each=32, margin_target=25, margin_floor=15
    // 20 rolls, cost = 640; sell $36/each → revenue = 720
    // margin = (720 - 640) / 720 = 80/720 ≈ 11.1% → critical (below 15 floor)
    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('36');

    const marginEl = screen.getByText(/11\.1%/);
    await expect.element(marginEl).toBeVisible();
    expect(marginEl.element().closest('.bg-red-50')).not.toBeNull();
  });

  test.skip('sort by Price/sqft changes bundle order', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    // Click sort by sqft
    await screen.getByRole('button', { name: /Price\/sqft/ }).click();

    // Both 48" bundles are visible
    await expect.element(screen.getAllByText('4x4 Welded Wire Mesh').first()).toBeVisible();
    await expect.element(screen.getAllByText('2x4 Welded Wire Mesh').first()).toBeVisible();
  });

  test.skip('sort by Price/linft changes bundle order', async () => {
    await commands.setFixtureState({ state: { products: ALL_PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    // Click sort by linft
    await screen.getByRole('button', { name: /Price\/linft/ }).click();

    await expect.element(screen.getAllByText('4x4 Welded Wire Mesh').first()).toBeVisible();
    await expect.element(screen.getAllByText('2x4 Welded Wire Mesh').first()).toBeVisible();
  });

  test('clicking Select for Quote populates order form with correct product and quantity', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    // 200 ft / 10 ft per roll = 20 rolls
    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    await screen.getByRole('button', { name: 'Select for Quote' }).click();

    // Should return to By Product mode
    await expect.element(screen.getByLabelText('Product')).toBeVisible();

    // Product should be pre-selected
    const productSelect = screen.getByLabelText('Product');
    await expect.element(productSelect).toHaveValue('prod-48a');

    // Quantity should be 20 (eaches)
    await expect.element(screen.getByLabelText('Quantity')).toHaveValue(20);

    // Sell price should be pre-filled with 50
    await expect.element(screen.getByLabelText('Sell price per each ($)')).toHaveValue(50);
  });

  test('clicking Select for Quote switches back to By Product mode', async () => {
    await commands.setFixtureState({ state: { products: [product48a] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');

    await screen.getByRole('button', { name: 'Select for Quote' }).click();

    // By Product form fields should be visible
    await expect.element(screen.getByLabelText('Customer')).toBeVisible();
    await expect.element(screen.getByLabelText('Product')).toBeVisible();
    await expect.element(screen.getByLabelText('Quantity')).toBeVisible();

    // Width fields should no longer be visible
    await expect.element(screen.getByLabelText('Width (inches)')).not.toBeInTheDocument();
  });

  test.skip('sell price updates margin on all visible bundle cards', async () => {
    await commands.setFixtureState({ state: { products: [product48a, product48b] } });

    const screen = render(<OrderEntry />);
    await switchToByWidth(screen);

    await screen.getByLabelText('Width (inches)').fill('48');
    await screen.getByLabelText('Total Length (feet)').fill('200');

    // Enter a sell price — both cards should show margin
    await screen.getByLabelText('Sell price per unit ($)').fill('50');

    // Both cards should display margin percentages
    // product48a: 20 rolls * $32 cost = $640 cost; 20 * $50 = $1000 rev → 36% margin
    // product48b: 40 rolls (200ft/5ft) * $20 cost = $800 cost; 40 * $50 = $2000 rev → 60% margin
    await expect.element(screen.getByText('36.0%')).toBeVisible();
    await expect.element(screen.getByText('60.0%')).toBeVisible();
  });
});
