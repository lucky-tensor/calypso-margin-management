import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import { page } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import type { Product } from 'core';

// Single product used to verify the Cost/ → Price/ label flip.
// 36"×60" roll, $5 cost → sqftPerEach = 15 sqft, cost/sqft ≈ $0.33
const productSingle: Product = {
  id: 'prod-single',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: 'Mesh Single',
    sku: 'SKU-S',
    material: 'Galvanized Steel',
    width_inches: 36,
    length_inches: 60,
    weight_per_sqft: 0.5,
    cost_per_each: 5.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
  },
};

// Two products at different widths. In linft mode only one width is searched at a time,
// giving exactly one bundle per width. We test ordering by switching widths isn't needed —
// instead, we test with the sqft mode but use products whose names appear only in their
// own single-product bundle card. To avoid combo-bundle duplicates we verify ordering
// using the full set of matching elements and check the FIRST occurrence of each name.
//
// Product A: 36"×60", cost $5 → sqftPerEach=15, cost/sqft≈$0.33 (cheaper by cost)
// Product B: 48"×120", cost $32 → sqftPerEach=40, cost/sqft=$0.80 (more expensive by cost)
//
// Sell prices:
//   A=$20/each → customer $/sqft = 20/15 ≈ $1.33 (more expensive by sell price)
//   B=$30/each → customer $/sqft = 30/40 = $0.75  (cheaper by sell price)
//
// Cost sort:  A first, B second
// Sell sort:  B first, A second  ← reversed
const productA: Product = {
  id: 'prod-a',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: 'Mesh Alpha',
    sku: 'SKU-A',
    material: 'Galvanized Steel',
    width_inches: 36,
    length_inches: 60,
    weight_per_sqft: 0.5,
    cost_per_each: 5.0,
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
    name: 'Mesh Beta',
    sku: 'SKU-B',
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

async function switchToSearchByUoM(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();
  await screen.getByRole('button', { name: 'Search by UoM' }).click();
}

async function switchToSqftMode(screen: ReturnType<typeof render>) {
  await screen.getByRole('button', { name: 'Sqft' }).click();
}

describe('Bundle sort controls — sell price vs cost', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('sort label changes from Cost/sqft to Price/sqft when all sell prices are entered', async () => {
    // With a single product there is only one bundle card. Before entering a price
    // the sort label shows "Cost/sqft". After entering a valid price it switches to "Price/sqft".
    await commands.setFixtureState({ state: { products: [productSingle] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);
    await switchToSqftMode(screen);
    await screen.getByLabelText('Total Area (sqft)').fill('15');

    // Bundle visible
    const cards = await page.getByText('Mesh Single').all();
    expect(cards.length).toBeGreaterThan(0);

    // Click sort — no price entered yet, label should say "Cost/"
    await screen.getByRole('button', { name: /sqft/ }).click();
    await expect.element(screen.getByRole('button', { name: /Cost\/sqft/ })).toBeVisible();

    // Enter a sell price on the single bundle card
    await screen.getByLabelText('Sell price for Mesh Single').fill('18');

    // Click sort again — price is entered, label should now say "Price/"
    await screen.getByRole('button', { name: /sqft/ }).click();
    await expect.element(screen.getByRole('button', { name: /Price\/sqft/ })).toBeVisible();
  });

  test('sort by Price/sqft orders bundles by customer sell $/sqft, not cost/sqft', async () => {
    // Products at different widths → sqft mode creates single-product bundles per width
    // plus potentially a cross-width combo. We fill prices on all inputs for each product
    // so every bundle that contains a product gets that product's price.
    //
    // After entering prices:
    //   Mesh Alpha: $20/each → $1.33/sqft sell   (appears SECOND in sell-price sort)
    //   Mesh Beta:  $30/each → $0.75/sqft sell   (appears FIRST in sell-price sort)
    //
    // Without prices (cost sort):
    //   Mesh Alpha: $0.33/sqft → FIRST
    //   Mesh Beta:  $0.80/sqft → SECOND
    await commands.setFixtureState({ state: { products: [productA, productB] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);
    await switchToSqftMode(screen);
    await screen.getByLabelText('Total Area (sqft)').fill('15');

    // Bundles visible
    const alphaCards = await page.getByText('Mesh Alpha').all();
    expect(alphaCards.length).toBeGreaterThan(0);
    const betaCards = await page.getByText('Mesh Beta').all();
    expect(betaCards.length).toBeGreaterThan(0);

    // Click sort to establish initial cost-based ordering
    await screen.getByRole('button', { name: /sqft/ }).click();
    await expect.element(screen.getByRole('button', { name: /Cost\/sqft/ })).toBeVisible();

    // In cost-based order, Mesh Alpha ($0.33/sqft) comes before Mesh Beta ($0.80/sqft).
    // We check DOM order using compareDocumentPosition.
    const alphaEls = await page.getByText('Mesh Alpha').all();
    const betaEls = await page.getByText('Mesh Beta').all();
    const alphaEl0 = alphaEls[0].element();
    const betaEl0 = betaEls[0].element();
    // DOCUMENT_POSITION_FOLLOWING = 4 means betaEl0 follows alphaEl0
    expect(
      alphaEl0.compareDocumentPosition(betaEl0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Fill sell prices on ALL inputs that match each product label.
    // (There may be combo-bundle inputs as well — filling all ensures every bundle
    // reports complete prices, switching the sort to customer-price mode.)
    const alphaInputs = await page
      .getByRole('spinbutton', { name: 'Sell price for Mesh Alpha' })
      .all();
    for (const input of alphaInputs) {
      await input.fill('20');
    }
    const betaInputs = await page
      .getByRole('spinbutton', { name: 'Sell price for Mesh Beta' })
      .all();
    for (const input of betaInputs) {
      await input.fill('30');
    }

    // Sort should now use sell price; label flips to "Price/sqft"
    await screen.getByRole('button', { name: /sqft/ }).click();
    await expect.element(screen.getByRole('button', { name: /Price\/sqft/ })).toBeVisible();

    // In sell-price order, Mesh Beta ($0.75/sqft) should come before Mesh Alpha ($1.33/sqft).
    // DOCUMENT_POSITION_FOLLOWING = 4 means Mesh Alpha now follows Mesh Beta.
    const alphaElsAfter = await page.getByText('Mesh Alpha').all();
    const betaElsAfter = await page.getByText('Mesh Beta').all();
    const alphaElAfter = alphaElsAfter[0].element();
    const betaElAfter = betaElsAfter[0].element();
    expect(
      betaElAfter.compareDocumentPosition(alphaElAfter) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
