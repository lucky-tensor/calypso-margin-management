/**
 * Tests for issue #87: Order Entry — role-aware stock display
 *
 * Tests verify:
 * - sales_rep sees simplified stock badge (no thresholds, no breakdown)
 * - inventory_manager sees full stock position panel
 * - Both roles see projected position after entering quantity
 * - Confirm button is disabled when stock is critical (can_order: false)
 * - Red banner explains why order is blocked
 */
import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import { AuthProvider } from '../../src/context/AuthContext';
import type { Product } from 'core';

const fixtureProduct: Product = {
  id: 'prod-stock-1',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: '6x6 Welded Wire Mesh',
    sku: 'WM-6X6-10GA',
    material: 'Galvanized Steel',
    width_inches: 72,
    length_inches: 120,
    weight_per_sqft: 0.75,
    cost_per_each: 48.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
    qty_on_hand_eaches: 100,
    safety_stock_eaches: 10,
    reorder_point_eaches: 25,
    reorder_qty_eaches: 50,
    lead_time_days: 7,
    pending_order_weight: 0.7,
  },
};

// Healthy stock position fixture
const healthyPosition = {
  qty_on_hand: 100,
  committed_qty: 5,
  pending_qty: 3,
  net_available: 95,
  effective_available: 92,
  status: 'healthy' as const,
  reorder_point: 25,
  safety_stock: 10,
  reorder_qty: 50,
  lead_time_days: 7,
  days_of_stock: null,
};

// Critical stock position — triggers order block
const criticalPosition = {
  qty_on_hand: 8,
  committed_qty: 0,
  pending_qty: 0,
  net_available: 8,
  effective_available: 8,
  status: 'critical' as const,
  reorder_point: 25,
  safety_stock: 10,
  reorder_qty: 50,
  lead_time_days: 7,
  days_of_stock: null,
};

// Warning stock position
const warningPosition = {
  qty_on_hand: 20,
  committed_qty: 2,
  pending_qty: 1,
  net_available: 18,
  effective_available: 17,
  status: 'warning' as const,
  reorder_point: 25,
  safety_stock: 10,
  reorder_qty: 50,
  lead_time_days: 7,
  days_of_stock: null,
};

const inventoryEntry = (position: typeof healthyPosition) => ({
  product_id: fixtureProduct.id,
  product_sku: fixtureProduct.properties.sku,
  product_name: fixtureProduct.properties.name,
  position,
});

const PRODUCT_OPTION = '6x6 Welded Wire Mesh (WM-6X6-10GA)';

async function selectProduct(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('option', { name: PRODUCT_OPTION })).toBeVisible();
  await screen.getByLabelText('Product').selectOptions(PRODUCT_OPTION);
}

describe('Order Entry — role-aware stock display', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('sales_rep sees simplified stock badge after selecting product', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(healthyPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Should show simplified badge with available count
    await expect.element(screen.getByText(/92.*available/)).toBeVisible();
    // Should show In Stock label
    await expect.element(screen.getByText('In Stock')).toBeVisible();
    // Should NOT show detailed breakdown fields
    await expect.element(screen.getByText(/Reorder point/)).not.toBeInTheDocument();
    await expect.element(screen.getByText(/Safety stock/)).not.toBeInTheDocument();
    await expect.element(screen.getByText(/Committed/)).not.toBeInTheDocument();
  });

  test('inventory_manager sees full stock position breakdown after selecting product', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'inventory_manager',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(healthyPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Should show full breakdown
    await expect.element(screen.getByText('Stock Position')).toBeVisible();
    await expect.element(screen.getByText('On hand')).toBeVisible();
    await expect.element(screen.getByText('Committed')).toBeVisible();
    await expect.element(screen.getByText('Effective available')).toBeVisible();
    await expect.element(screen.getByText('Reorder point')).toBeVisible();
    await expect.element(screen.getByText('Safety stock')).toBeVisible();
  });

  test('sales_rep does NOT see Stock Position panel (full breakdown)', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(healthyPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Stock badge should show
    await expect.element(screen.getByText(/available/)).toBeVisible();
    // Full position panel should NOT show
    await expect.element(screen.getByText('Stock Position')).not.toBeInTheDocument();
    // No breakdown fields
    await expect.element(screen.getByText('On hand')).not.toBeInTheDocument();
  });

  test('sales_rep sees projected availability after entering quantity', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(healthyPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Wait for badge to appear
    await expect.element(screen.getByText(/92.*available/)).toBeVisible();

    // Enter a quantity (60 sqft = 1 each for 72"×120" product: 72*120/144=60)
    await screen.getByLabelText('Quantity').fill('60');

    // Projected section should appear
    await expect.element(screen.getByText('After this order:')).toBeVisible();
    await expect.element(screen.getByText(/projected/)).toBeVisible();
  });

  test('inventory_manager sees projected position after entering quantity', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'inventory_manager',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(healthyPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Wait for full panel to appear
    await expect.element(screen.getByText('Stock Position')).toBeVisible();

    // Enter a quantity
    await screen.getByLabelText('Quantity').fill('60');

    // Projected section should appear
    await expect.element(screen.getByText('After this order:')).toBeVisible();
    await expect.element(screen.getByText('Projected effective')).toBeVisible();
    await expect.element(screen.getByText('Projected status')).toBeVisible();
  });

  test('Confirm button is disabled when stock is critical (can_order: false)', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(criticalPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Wait for badge to show Out of Stock
    await expect.element(screen.getByText('Out of Stock')).toBeVisible();

    // Fill in all fields
    await screen.getByLabelText('Customer').fill('Test Customer');
    await screen.getByLabelText('Quantity').fill('60');
    await screen.getByLabelText('Sell price per roll ($)').fill('64.00');

    // Confirm button should be disabled
    const confirmBtn = screen.getByRole('button', { name: 'Confirm Order' });
    await expect.element(confirmBtn).toBeDisabled();
  });

  test('Red banner explains order is blocked when stock is critical', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(criticalPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Wait for Out of Stock badge
    await expect.element(screen.getByText('Out of Stock')).toBeVisible();

    // Red banner should be visible
    await expect.element(screen.getByText(/Cannot place order.*out of stock/)).toBeVisible();
  });

  test('Confirm button is enabled when stock is healthy', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(healthyPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    // Wait for In Stock badge
    await expect.element(screen.getByText('In Stock')).toBeVisible();

    // Fill in required fields
    await screen.getByLabelText('Customer').fill('Test Customer');
    await screen.getByLabelText('Quantity').fill('60');
    await screen.getByLabelText('Sell price per roll ($)').fill('64.00');

    // Confirm button should be enabled
    const confirmBtn = screen.getByRole('button', { name: 'Confirm Order' });
    await expect.element(confirmBtn).not.toBeDisabled();
  });

  test('sales_rep sees Low Stock badge when position is warning', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [fixtureProduct],
        inventoryEntries: [inventoryEntry(warningPosition)],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderEntry />
      </AuthProvider>,
    );

    await selectProduct(screen);

    await expect.element(screen.getByText('Low Stock')).toBeVisible();
    // No stock-blocked banner for warning status
    await expect.element(screen.getByText(/Cannot place order/)).not.toBeInTheDocument();
  });
});
