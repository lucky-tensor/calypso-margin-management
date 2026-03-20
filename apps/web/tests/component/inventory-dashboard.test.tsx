import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { AuthProvider } from '../../src/context/AuthContext';
import { InventoryDashboard } from '../../src/components/InventoryDashboard';
import App from '../../src/App';
import type { InventoryEntry } from '../component/fixture-server';

const fixtureInventory: InventoryEntry[] = [
  {
    product_id: 'prod-1',
    product_sku: 'TS-5050',
    product_name: '4x4 Welded Wire',
    position: {
      qty_on_hand: 100,
      committed_qty: 10,
      pending_qty: 5,
      net_available: 90,
      effective_available: 86.5,
      status: 'healthy',
      reorder_point: 20,
      safety_stock: 5,
      reorder_qty: 50,
      lead_time_days: 7,
      days_of_stock: null,
    },
  },
  {
    product_id: 'prod-2',
    product_sku: 'TH-001',
    product_name: 'Hex Wire Mesh',
    position: {
      qty_on_hand: 15,
      committed_qty: 5,
      pending_qty: 2,
      net_available: 10,
      effective_available: 8.6,
      status: 'warning',
      reorder_point: 20,
      safety_stock: 5,
      reorder_qty: 30,
      lead_time_days: 5,
      days_of_stock: null,
    },
  },
  {
    product_id: 'prod-3',
    product_sku: 'TC-001',
    product_name: 'Chain Link Fence',
    position: {
      qty_on_hand: 3,
      committed_qty: 2,
      pending_qty: 1,
      net_available: 1,
      effective_available: 0.3,
      status: 'critical',
      reorder_point: 20,
      safety_stock: 5,
      reorder_qty: 100,
      lead_time_days: 14,
      days_of_stock: null,
    },
  },
];

describe('InventoryDashboard', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('login as inv_manager — Inventory view loads with product table', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'inventory_manager',
        inventoryEntries: fixtureInventory,
      },
    });

    const screen = render(
      <AuthProvider>
        <InventoryDashboard />
      </AuthProvider>,
    );

    // Wait for table header
    await expect.element(screen.getByText('SKU')).toBeVisible();
    await expect.element(screen.getByText('Name')).toBeVisible();
    await expect.element(screen.getByText('On Hand')).toBeVisible();
    await expect.element(screen.getByText('Committed')).toBeVisible();
    await expect.element(screen.getByText('Effective Available')).toBeVisible();

    // Products appear
    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await expect.element(screen.getByText('4x4 Welded Wire')).toBeVisible();
    await expect.element(screen.getByText('TH-001')).toBeVisible();
    await expect.element(screen.getByText('TC-001')).toBeVisible();
  });

  test('filter "Critical" — only critical products shown', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'inventory_manager',
        inventoryEntries: fixtureInventory,
      },
    });

    const screen = render(
      <AuthProvider>
        <InventoryDashboard />
      </AuthProvider>,
    );

    // Wait for the table to load
    await expect.element(screen.getByText('TS-5050')).toBeVisible();

    // Click the Critical filter
    await screen.getByRole('button', { name: 'Critical' }).click();

    // Only critical product should be visible
    await expect.element(screen.getByText('TC-001')).toBeVisible();
    await expect.element(screen.getByText('Chain Link Fence')).toBeVisible();

    // Non-critical products should not be shown
    await expect.element(screen.getByText('TS-5050')).not.toBeInTheDocument();
    await expect.element(screen.getByText('TH-001')).not.toBeInTheDocument();
  });

  test('click row — transaction log appears', async () => {
    const transactions = [
      {
        id: 'txn-1',
        created_at: '2024-01-15T10:00:00Z',
        product_id: 'prod-1',
        product_sku: 'TS-5050',
        txn_type: 'receipt',
        qty_eaches: 50,
        reference: 'PO-2024-001',
        balance_after: 100,
        created_by: 'test-user',
      },
    ];

    await commands.setFixtureState({
      state: {
        currentRole: 'inventory_manager',
        inventoryEntries: fixtureInventory,
        inventoryTransactions: { 'prod-1': transactions },
      },
    });

    const screen = render(
      <AuthProvider>
        <InventoryDashboard />
      </AuthProvider>,
    );

    // Wait for table
    await expect.element(screen.getByText('4x4 Welded Wire')).toBeVisible();

    // Click the first product row
    await screen.getByText('4x4 Welded Wire').click();

    // Transaction log should appear
    await expect.element(screen.getByText('PO-2024-001')).toBeVisible();
    await expect.element(screen.getByText('receipt')).toBeVisible();
  });
});

describe('Inventory nav visibility', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('Inventory nav item visible for inventory_manager', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'inventory_manager',
        products: [],
        orders: [],
        inventoryEntries: [],
      },
    });

    const screen = render(<App />);

    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();
    await expect.element(screen.getByTitle('Inventory')).toBeVisible();
  });

  test('Inventory nav item hidden for sales_rep', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        products: [],
        orders: [],
      },
    });

    const screen = render(<App />);

    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();
    await expect.element(screen.getByTitle('Inventory')).not.toBeInTheDocument();
  });
});
