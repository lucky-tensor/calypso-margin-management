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
//
// Cost/sqft: A = $100/400 = $0.25, B = $400/400 = $1.00
// Customer seeded $/sqft: A = 10*$13.34/400 = $0.334, B = 10*$53.34/400 = $1.334
//
// Both orders are A < B.
// To invert: set A's price high and B's price low.

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
  },
};

const PRODUCTS = [productA, productB];

async function switchToSearchByUoM(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();
  await screen.getByRole('button', { name: 'Search by UoM' }).click();
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
    // With 2 same-width products, engine produces: single-A, single-B, combo A+B bundles.
    // Each bundle card has its own sell price inputs seeded at target margin.
    //
    // Single-A bundle: 10 rolls Alpha, seeded $/each = $13.34
    //   customer $/sqft = (10 * $13.34) / 400 = $0.334
    // Single-B bundle: 10 rolls Beta, seeded $/each = $53.34
    //   customer $/sqft = (10 * $53.34) / 400 = $1.334
    //
    // Default sort by customer $/sqft → A first.
    //
    // Now invert: set Alpha to $200/each, Beta to $45/each on ALL inputs.
    //   A: (10 * $200) / 400 = $5.00/sqft
    //   B: (10 * $45) / 400 = $1.125/sqft
    //   → B first.
    await commands.setFixtureState({ state: { products: PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('100');

    // Wait for bundle cards
    await expect.element(screen.getByText('SKU-ALPHA').first()).toBeVisible();
    await expect.element(screen.getByText('SKU-BETA').first()).toBeVisible();

    // Verify sort button says "Price/sqft" (since prices are seeded)
    await expect.element(screen.getByRole('button', { name: /Price\/sqft/ })).toBeVisible();

    // Change ALL Alpha inputs to $200 and ALL Beta inputs to $45
    const alphaInputs = await screen.getByLabelText('Sell price for Alpha Mesh').all();
    for (const input of alphaInputs) {
      await input.fill('200');
    }
    const betaInputs = await screen.getByLabelText('Sell price for Beta Mesh').all();
    for (const input of betaInputs) {
      await input.fill('45');
    }

    // Click sort by Price/sqft
    await screen.getByRole('button', { name: /Price\/sqft/ }).click();

    // B should now be first (lower customer $/sqft)
    const order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-BETA', 'SKU-ALPHA']);
  });

  test('when sell prices are absent, sort falls back to cost-based with label indication', async () => {
    await commands.setFixtureState({ state: { products: PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('100');

    await expect.element(screen.getByText('SKU-ALPHA').first()).toBeVisible();

    // Clear ALL sell price inputs to trigger cost-based fallback
    const alphaInputs = await screen.getByLabelText('Sell price for Alpha Mesh').all();
    for (const input of alphaInputs) {
      await input.fill('');
    }
    const betaInputs = await screen.getByLabelText('Sell price for Beta Mesh').all();
    for (const input of betaInputs) {
      await input.fill('');
    }

    // Sort label should show "Cost/sqft (est.)"
    await expect
      .element(screen.getByRole('button', { name: /Cost\/sqft \(est\.\)/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: /Cost\/linft \(est\.\)/ }))
      .toBeVisible();

    // Click cost-based sort
    await screen.getByRole('button', { name: /Cost\/sqft \(est\.\)/ }).click();

    // Cost/sqft: A ($0.25) < B ($1.00) → Alpha first
    const order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-ALPHA', 'SKU-BETA']);
  });

  test('sort re-computes when sell price changes on a card', async () => {
    await commands.setFixtureState({ state: { products: PRODUCTS } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('100');

    await expect.element(screen.getByText('SKU-ALPHA').first()).toBeVisible();

    // Initially seeded: A $/sqft < B $/sqft → A first
    await screen.getByRole('button', { name: /Price\/sqft/ }).click();
    let order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-ALPHA', 'SKU-BETA']);

    // Change all Alpha prices to $200 to push A above B
    const alphaInputs = await screen.getByLabelText('Sell price for Alpha Mesh').all();
    for (const input of alphaInputs) {
      await input.fill('200');
    }

    // Sort should re-compute: B should now be first
    order = await getFirstSKUOrder(['SKU-ALPHA', 'SKU-BETA']);
    expect(order).toEqual(['SKU-BETA', 'SKU-ALPHA']);
  });
});
