import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { ProductCatalog, validateForm } from '../../src/components/ProductCatalog';
import { AuthProvider } from '../../src/context/AuthContext';
import type { Product } from 'core';

const fixtureProduct: Product = {
  id: 'prod-inv-1',
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
    reorder_point_eaches: 30,
    reorder_qty_eaches: 50,
    lead_time_days: 7,
    pending_order_weight: 0.7,
  },
};

describe('ProductCatalog — inventory config section', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('inventory_manager sees Inventory Settings section in edit modal', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProduct], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();

    await screen.getByTitle('Edit').click();

    await expect.element(screen.getByText('Edit Product')).toBeVisible();
    await expect.element(screen.getByText('Inventory Settings')).toBeVisible();
    await expect.element(screen.getByLabelText('Safety Stock (eaches)')).toBeVisible();
    await expect.element(screen.getByLabelText('Reorder Point (eaches)')).toBeVisible();
    await expect.element(screen.getByLabelText(/Pending Order Weight/)).toBeVisible();
  });

  test('sales_rep does not see Inventory Settings section in edit modal', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProduct], currentRole: 'sales_rep' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    // sales_rep cannot edit — no edit button, no modal
    // Verify the Edit button is not present
    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    const editButtons = screen.getByTitle('Edit');
    await expect.element(editButtons).not.toBeInTheDocument();
  });

  test('inventory_manager can see current stock and Adjust Stock button', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProduct], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await screen.getByTitle('Edit').click();

    await expect.element(screen.getByText('Inventory Settings')).toBeVisible();
    await expect.element(screen.getByText(/Current stock:/)).toBeVisible();
    await expect.element(screen.getByText('100 eaches')).toBeVisible();
    await expect.element(screen.getByText('Adjust Stock')).toBeVisible();
  });

  test('Adjust Stock button closes modal and opens stock adjustment dialog', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProduct], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await screen.getByTitle('Edit').click();
    await expect.element(screen.getByText('Inventory Settings')).toBeVisible();

    // Click the Adjust Stock button in the modal (text content button, not the table row icon)
    await screen.getByText('Adjust Stock').click();

    // Edit modal should close and stock adjustment dialog should open
    await expect.element(screen.getByRole('heading', { name: 'Stock Adjustment' })).toBeVisible();
  });

  test('inventory fields pre-fill from product properties', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProduct], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await screen.getByTitle('Edit').click();

    await expect.element(screen.getByText('Inventory Settings')).toBeVisible();
    await expect.element(screen.getByLabelText('Safety Stock (eaches)')).toHaveValue(10);
    await expect.element(screen.getByLabelText('Reorder Point (eaches)')).toHaveValue(30);
    await expect.element(screen.getByLabelText(/Pending Order Weight/)).toHaveValue(0.7);
  });

  test('inventory_manager can save inventory fields', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProduct], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await screen.getByTitle('Edit').click();

    await expect.element(screen.getByText('Inventory Settings')).toBeVisible();

    // Update safety stock and reorder point
    const safetyStockInput = screen.getByLabelText('Safety Stock (eaches)');
    await safetyStockInput.fill('15');

    const reorderPointInput = screen.getByLabelText('Reorder Point (eaches)');
    await reorderPointInput.fill('40');

    await screen.getByRole('button', { name: 'Save' }).click();

    // Modal closes and product list refreshes
    await expect.element(screen.getByText('TS-5050')).toBeVisible();
  });
});

describe('validateForm — inventory validation', () => {
  const baseForm = {
    name: 'Test',
    sku: 'T-001',
    material: 'Steel',
    width_inches: '48',
    length_inches: '96',
    weight_per_sqft: '1',
    cost_per_each: '10',
    cost_per_linft: '',
    cost_per_sqft: '',
    primary_cost_basis: 'each' as const,
    margin_target: '25',
    margin_floor: '15',
    safety_stock_eaches: '10',
    reorder_point_eaches: '30',
    reorder_qty_eaches: '',
    lead_time_days: '',
    pending_order_weight: '0.7',
  };

  test('valid form passes with reorder_point >= safety_stock', () => {
    const errors = validateForm({
      ...baseForm,
      safety_stock_eaches: '10',
      reorder_point_eaches: '10',
    });
    expect(errors).toHaveLength(0);
  });

  test('reorder_point < safety_stock is a validation error', () => {
    const errors = validateForm({
      ...baseForm,
      safety_stock_eaches: '30',
      reorder_point_eaches: '10',
    });
    expect(errors).toContain('Reorder point must be >= safety stock');
  });

  test('pending_order_weight > 1.0 is a validation error', () => {
    const errors = validateForm({ ...baseForm, pending_order_weight: '1.5' });
    expect(errors).toContain('Pending order weight must be between 0.0 and 1.0');
  });

  test('pending_order_weight < 0 is a validation error', () => {
    const errors = validateForm({ ...baseForm, pending_order_weight: '-0.1' });
    expect(errors).toContain('Pending order weight must be between 0.0 and 1.0');
  });

  test('valid pending_order_weight at boundary values passes', () => {
    expect(validateForm({ ...baseForm, pending_order_weight: '0' })).toHaveLength(0);
    expect(validateForm({ ...baseForm, pending_order_weight: '1' })).toHaveLength(0);
  });
});
