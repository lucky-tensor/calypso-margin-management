import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import { page } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import type { Product } from 'core';

// Two products at same width but different costs.
// 48" x 120" = 40 sqft/roll, 10 linft/roll.
//
// For 100 ft (linft mode, width=48"):
//   A: ceil(100/10) = 10 rolls, cost = 10*$10 = $100
//   B: ceil(100/10) = 10 rolls, cost = 10*$40 = $400
//
// Seeded sell price (target margin 25%): A = $10/0.75 = $13.34, B = $40/0.75 = $53.34

const productA: Product = {
  id: 'prod-a',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: 'Alpha Mesh',
    sku: 'SKU-ALPHA',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120,
    weight_per_sqft: 0.58,
    cost_per_each: 10.0,
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
};

const productB: Product = {
  id: 'prod-b',
  created_at: '2024-01-02T00:00:00Z',
  properties: {
    name: 'Beta Mesh',
    sku: 'SKU-BETA',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120,
    weight_per_sqft: 0.58,
    cost_per_each: 40.0,
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
};

const PRODUCTS = [productA, productB];

async function switchToSearchByUoM(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'Order Optimizer' })).toBeVisible();
  await screen.getByRole('button', { name: 'Order Optimizer' }).click();
}

/** Wait for bundles to render by checking that at least one sell price input for Alpha exists. */
async function waitForBundles() {
  // Poll until we find at least one spinbutton for Alpha Mesh
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const inputs = await page.getByRole('spinbutton', { name: 'Sell price for Alpha Mesh' }).all();
    if (inputs.length > 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Timed out waiting for bundle cards');
}

/** Fill ALL sell price inputs for a given product name with the given value. */
async function fillAllPrices(productName: string, value: string) {
  const inputs = await page
    .getByRole('spinbutton', { name: `Sell price for ${productName}` })
    .all();
  for (const input of inputs) {
    await input.fill(value);
  }
}

/**
 * Gets the visual order of the first occurrence of the given SKUs on the page.
 */
async function getFirstSKUOrder(skus: string[]): Promise<string[]> {
  const results: Array<{ sku: string; top: number }> = [];
  for (const sku of skus) {
    const elements = await page.getByText(sku).all();
    if (elements.length > 0) {
      const rect = elements[0].element().getBoundingClientRect();
      results.push({ sku, top: rect.top });
    }
  }
  results.sort((a, b) => a.top - b.top);
  return results.map((r) => r.sku);
}

describe('Sort by sell price (#55)', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('with sell prices entered, sort by Price/sqft uses customer sell $/sqft', async () => {
    // Engine produces: single-A, single-B, and combo A+B bundles.
    // Each bundle card has independently seeded prices.
    //
    // We set ALL Alpha inputs to $200/each and ALL Beta inputs to $45/each.
    // Single-A: 10*$200/400sqft = $5.00/sqft
    // Single-B: 10*$45/400sqft = $1.125/sqft
    // → B appears before A in ascending sort.
    await commands.setFixtureState({ state: { products: PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('100');
    await waitForBundles();

    // Sort button should say "Price/sqft" (sell prices are seeded)
    await expect.element(screen.getByRole('button', { name: /Price\/sqft/ })).toBeVisible();

    // Set custom sell prices on ALL inputs
    await fillAllPrices('Alpha Mesh', '200');
    await fillAllPrices('Beta Mesh', '45');

    // Trigger sort
    await screen.getByRole('button', { name: /Price\/sqft/ }).click();

    // B ($1.125/sqft) < A ($5.00/sqft)
    const order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-BETA', 'SKU-ALPHA']);
  });

  test('when sell prices are absent, sort falls back to cost-based with label indication', async () => {
    await commands.setFixtureState({ state: { products: PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('100');
    await waitForBundles();

    // Clear ALL sell prices
    await fillAllPrices('Alpha Mesh', '');
    await fillAllPrices('Beta Mesh', '');

    // Labels should switch to cost-based indication
    await expect
      .element(screen.getByRole('button', { name: /Cost\/sqft \(est\.\)/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: /Cost\/linft \(est\.\)/ }))
      .toBeVisible();

    // Click cost-based sort
    await screen.getByRole('button', { name: /Cost\/sqft \(est\.\)/ }).click();

    // Cost/sqft: A ($0.25) < B ($1.00)
    const order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-ALPHA', 'SKU-BETA']);
  });

  test('sort re-computes when sell price changes on a card', async () => {
    await commands.setFixtureState({ state: { products: PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('100');
    await waitForBundles();

    // Seeded: A $/sqft ($0.334) < B $/sqft ($1.334) → A first
    await screen.getByRole('button', { name: /Price\/sqft/ }).click();
    let order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-ALPHA', 'SKU-BETA']);

    // Change all Alpha prices to $200 → A = $5.00/sqft, B seeded = $1.334/sqft → B first
    await fillAllPrices('Alpha Mesh', '200');

    order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-BETA', 'SKU-ALPHA']);
  });
});
