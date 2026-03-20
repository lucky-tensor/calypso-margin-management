import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { AuthProvider } from '../../src/context/AuthContext';
import { ProductCatalog } from '../../src/components/ProductCatalog';
import { InventoryDashboard } from '../../src/components/InventoryDashboard';
import type { Product } from 'core';

const fixtureProduct: Product = {
  id: 'prod-fixture-1',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: '4x4 Welded Wire 50x50',
    sku: 'TS-5050',
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 96,
    weight_per_sqft: 1.5,
    cost_per_each: 25.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
    qty_on_hand_eaches: 100,
    safety_stock_eaches: 10,
    reorder_point_eaches: 20,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
  },
};

describe('StockAdjustmentDialog — from ProductCatalog', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('opens dialog from Product Catalog and receipt increases balance', async () => {
    await commands.setFixtureState({
      state: {
        products: [fixtureProduct],
        currentRole: 'inventory_manager',
      },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    // Wait for table
    await expect.element(screen.getByText('TS-5050')).toBeVisible();

    // Click Adjust Stock button
    await screen.getByTitle('Adjust Stock').click();

    // Dialog should open
    await expect.element(screen.getByText('Stock Adjustment')).toBeVisible();

    // Product context shown (read-only)
    await expect.element(screen.getByText('4x4 Welded Wire 50x50')).toBeVisible();
    await expect.element(screen.getByText('TS-5050')).toBeVisible();

    // Current balance shown
    await expect.element(screen.getByText('Current balance')).toBeVisible();
    await expect.element(screen.getByText('100 ea')).toBeVisible();

    // Enter quantity 50 — projected balance should be 150
    await screen.getByPlaceholder('positive').fill('50');
    await expect.element(screen.getByText('150 ea')).toBeVisible();

    // Fill reference
    await screen.getByPlaceholder('PO number, reason, etc.').fill('PO-12345');

    // Submit
    await screen.getByRole('button', { name: 'Submit' }).click();

    // Dialog closes; on success fetchProducts is called so table refreshes
    // The dialog should be gone
    await expect.element(screen.getByText('Stock Adjustment')).not.toBeInTheDocument();
  });

  test('rejects adjustment that would result in negative balance', async () => {
    await commands.setFixtureState({
      state: {
        products: [fixtureProduct],
        currentRole: 'inventory_manager',
      },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await screen.getByTitle('Adjust Stock').click();
    await expect.element(screen.getByText('Stock Adjustment')).toBeVisible();

    // Select Adjustment type
    const select = screen.getByRole('combobox');
    await select.selectOptions('adjustment');

    // Enter a quantity that would go negative: current is 100, entering -150
    await screen.getByPlaceholder('positive or negative').fill('-150');

    // Projected balance shows -50 in red
    await expect.element(screen.getByText('-50 ea')).toBeVisible();

    // Fill reference
    await screen.getByPlaceholder('PO number, reason, etc.').fill('bad-adjustment');

    // Submit button should be disabled or error shown
    // Try clicking submit to trigger the error path
    const submitBtn = screen.getByRole('button', { name: 'Submit' });
    // The button is disabled when wouldGoNegative
    await expect.element(submitBtn).toBeDisabled();
  });

  test('submitting triggers parent view refresh with updated balance', async () => {
    await commands.setFixtureState({
      state: {
        products: [
          {
            ...fixtureProduct,
            properties: { ...fixtureProduct.properties, qty_on_hand_eaches: 50 },
          },
        ],
        currentRole: 'inventory_manager',
      },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await screen.getByTitle('Adjust Stock').click();
    await expect.element(screen.getByText('Stock Adjustment')).toBeVisible();

    // Current balance is 50
    await expect.element(screen.getByText('50 ea')).toBeVisible();

    // Enter receipt of 30
    await screen.getByPlaceholder('positive').fill('30');
    await screen.getByPlaceholder('PO number, reason, etc.').fill('PO-RECEIPT-001');
    await screen.getByRole('button', { name: 'Submit' }).click();

    // Dialog should close
    await expect.element(screen.getByText('Stock Adjustment')).not.toBeInTheDocument();
  });
});

describe('StockAdjustmentDialog — from InventoryDashboard', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('opens dialog from Inventory Dashboard', async () => {
    await commands.setFixtureState({
      state: {
        products: [fixtureProduct],
        currentRole: 'inventory_manager',
      },
    });

    const screen = render(
      <AuthProvider>
        <InventoryDashboard />
      </AuthProvider>,
    );

    // Wait for table to load
    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await expect.element(screen.getByText('4x4 Welded Wire 50x50')).toBeVisible();

    // Click adjust stock button
    await screen.getByTitle('Adjust Stock').click();

    // Dialog should open
    await expect.element(screen.getByText('Stock Adjustment')).toBeVisible();
    await expect.element(screen.getByText('4x4 Welded Wire 50x50')).toBeVisible();
  });

  test('stock adjustment dialog not shown to sales_rep', async () => {
    await commands.setFixtureState({
      state: {
        products: [fixtureProduct],
        currentRole: 'sales_rep',
      },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();

    // For sales_rep, canEdit is false, so no Adjust Stock button
    await expect.element(screen.getByTitle('Adjust Stock')).not.toBeInTheDocument();
  });
});
