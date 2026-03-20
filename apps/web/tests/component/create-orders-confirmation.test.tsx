import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import type { Product } from 'core';

const product: Product = {
  id: 'prod-confirm-1',
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
    qty_on_hand_eaches: 0,
    safety_stock_eaches: 0,
    reorder_point_eaches: 0,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
  },
};

// A product whose id will not be found by the fixture server when POSTing,
// because it is only present in the catalog fixture state used by the UI
// but the fixture server checks for product_id in state.products.
// We set state.products to [ghostProduct] so the UI renders bundle cards,
// but the server returns 404 for the POST because the product_id matches
// a product that has no entry in state.products on the server side.
// In practice the easiest approach: set state.products = [] after rendering
// the bundles — but that resets the UI. Instead we rely on the fixture
// server validating product_id against state.products; ghostProduct.id
// ('prod-ghost-does-not-exist') will never match any product created via
// the catalog fixture, so POST returns { error: 'Product not found' }.
const ghostProduct: Product = {
  id: 'prod-ghost-does-not-exist',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: 'Ghost Mesh',
    sku: 'WM-GHOST',
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
    qty_on_hand_eaches: 0,
    safety_stock_eaches: 0,
    reorder_point_eaches: 0,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
  },
};

async function switchToSearchByUoM(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();
  await screen.getByRole('button', { name: 'Search by UoM' }).click();
}

describe('Create Orders — confirmation step and error display', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('clicking "Confirm Order" shows confirmation summary before calling API', async () => {
    await commands.setFixtureState({ state: { products: [product] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Customer').fill('Acme Fencing Co');
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    await screen.getByRole('button', { name: 'Confirm Order' }).click();

    // Confirmation summary should be visible
    await expect.element(screen.getByText('Review Order')).toBeVisible();
    await expect.element(screen.getByText(/Acme Fencing Co/)).toBeVisible();
    await expect.element(screen.getByText(/4x4 Welded Wire Mesh/)).toBeVisible();

    // No orders should have been created yet
    const state = (await commands.getFixtureState()) as { orders?: unknown[] };
    expect(state.orders ?? []).toHaveLength(0);
  });

  test('clicking "Cancel" in confirmation returns card to editable state', async () => {
    await commands.setFixtureState({ state: { products: [product] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Customer').fill('Acme Fencing Co');
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    await screen.getByRole('button', { name: 'Confirm Order' }).click();

    // Confirmation summary is shown — Cancel button visible
    await expect.element(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await screen.getByRole('button', { name: 'Cancel' }).click();

    // Should be back to editable state — "Confirm Order" button visible again
    await expect.element(screen.getByRole('button', { name: 'Confirm Order' })).toBeVisible();
    // Confirmation summary gone
    await expect.element(screen.getByText('Review Order')).not.toBeInTheDocument();
  });

  test('clicking "Confirm" in review step calls API and shows success banner', async () => {
    await commands.setFixtureState({ state: { products: [product] } });

    const screen = render(<OrderEntry />);
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Customer').fill('Acme Fencing Co');
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('200');
    await screen.getByLabelText('Sell price for 4x4 Welded Wire Mesh').fill('50');

    await screen.getByRole('button', { name: 'Confirm Order' }).click();
    await expect.element(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await screen.getByRole('button', { name: 'Confirm' }).click();

    // Success banner should appear with action buttons
    await expect.element(screen.getByText(/Order confirmed!/)).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'New Order' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'View Orders' })).toBeVisible();

    const state = (await commands.getFixtureState()) as {
      orders?: Array<{ properties: { product_name: string } }>;
    };
    expect(state.orders).toHaveLength(1);
    expect(state.orders![0].properties.product_name).toBe('4x4 Welded Wire Mesh');
  });

  test('POST failure shows error message and does not navigate to history', async () => {
    // Set ghostProduct in state so the UI renders bundle cards for it.
    await commands.setFixtureState({ state: { products: [ghostProduct] } });

    let navigatedToHistory = false;
    const screen = render(
      <OrderEntry
        onNavigateToHistory={() => {
          navigatedToHistory = true;
        }}
      />,
    );
    await switchToSearchByUoM(screen);

    await screen.getByLabelText('Customer').fill('Test Customer');
    await screen.getByLabelText('Width').selectOptions('48');
    await screen.getByLabelText('Total Length (ft)').fill('120');
    await screen.getByLabelText('Sell price for Ghost Mesh').fill('40');

    // Remove the product from fixture state so POST /api/orders returns 404.
    // The UI has already rendered the bundle card and won't re-fetch.
    await commands.setFixtureState({ state: { products: [] } });

    await screen.getByRole('button', { name: 'Confirm Order' }).click();
    await expect.element(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await screen.getByRole('button', { name: 'Confirm' }).click();

    // Error banner should appear
    await expect.element(screen.getByText('Product not found')).toBeVisible();

    // Navigation must NOT have been triggered
    expect(navigatedToHistory).toBe(false);
  });
});
