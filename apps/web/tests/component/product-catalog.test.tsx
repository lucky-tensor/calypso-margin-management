import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands, page } from '@vitest/browser/context';
import React from 'react';
import { ProductCatalog } from '../../src/components/ProductCatalog';
import { AuthProvider } from '../../src/context/AuthContext';
import type { Product } from 'core';

const fixtureProducts: Product[] = [
  {
    id: 'prod-1',
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
      qty_on_hand_eaches: 0,
      safety_stock_eaches: 0,
      reorder_point_eaches: 0,
      reorder_qty_eaches: null,
      lead_time_days: null,
      pending_order_weight: 0.7,
    },
  },
  {
    id: 'prod-2',
    created_at: '2024-01-02T00:00:00Z',
    properties: {
      name: 'Hex Wire Mesh',
      sku: 'TH-001',
      material: 'Stainless Steel',
      width_inches: 36,
      length_inches: 120,
      weight_per_sqft: 0.8,
      cost_per_each: null,
      cost_per_linft: 3.5,
      cost_per_sqft: null,
      primary_cost_basis: 'linear_foot',
      margin_target: 30,
      margin_floor: 20,
    },
  },
];

describe('ProductCatalog', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('displays products in a table', async () => {
    await commands.setFixtureState({
      state: { products: fixtureProducts, currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    // Wait for the table to render
    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await expect.element(screen.getByText('4x4 Welded Wire 50x50')).toBeVisible();
    await expect.element(screen.getByText('Galvanized Steel')).toBeVisible();
    await expect.element(screen.getByText('TH-001')).toBeVisible();
    await expect.element(screen.getByText('Hex Wire Mesh')).toBeVisible();

    // Column headers
    await expect.element(screen.getByText('SKU')).toBeVisible();
    await expect.element(screen.getByText('Name')).toBeVisible();
    await expect.element(screen.getByText('Material')).toBeVisible();
  });

  test('shows empty state when no products', async () => {
    await commands.setFixtureState({
      state: { products: [], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText(/No products yet/)).toBeVisible();
  });

  test('opens add modal and submits product', async () => {
    await commands.setFixtureState({
      state: { products: [], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    // Wait for empty state, then click add
    await expect.element(screen.getByText(/No products yet/)).toBeVisible();

    await screen.getByRole('button', { name: 'Add Product' }).click();

    // Modal should open - verify form fields are present
    await expect.element(screen.getByPlaceholder('Product name')).toBeVisible();

    // Fill in the form
    const nameInput = screen.getByPlaceholder('Product name');
    await nameInput.fill('New Product');

    const skuInput = screen.getByPlaceholder('SKU code');
    await skuInput.fill('NP-001');

    const materialInput = screen.getByPlaceholder('Material type');
    await materialInput.fill('Steel');

    // Fill numeric fields using label text via page locators
    await screen.getByLabelText('Width (in.)').fill('48');
    await screen.getByLabelText('Length (in.)').fill('96');
    await screen.getByLabelText('Cost per each ($)').fill('25.00');

    // Submit the form
    await screen.getByText('Save').click();

    // After save, the new product should appear in the table
    await expect.element(page.getByText('NP-001'), { timeout: 5000 }).toBeVisible();
    await expect.element(page.getByText('New Product'), { timeout: 5000 }).toBeVisible();
  });

  test('shows validation errors for missing required fields', async () => {
    await commands.setFixtureState({
      state: { products: [], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText(/No products yet/)).toBeVisible();

    await screen.getByRole('button', { name: 'Add Product' }).click();

    // Submit without filling anything
    await screen.getByRole('button', { name: 'Save' }).click();

    // Should show validation errors
    await expect.element(screen.getByText('Name is required')).toBeVisible();
    await expect.element(screen.getByText('SKU is required')).toBeVisible();
  });

  test('edit button opens modal pre-filled with product data', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProducts[0]], currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    // Wait for table to render
    await expect.element(screen.getByText('TS-5050')).toBeVisible();

    // Click edit button
    await screen.getByTitle('Edit').click();

    // Modal should open with "Edit Product" title
    await expect.element(screen.getByText('Edit Product')).toBeVisible();

    // Fields should be pre-filled
    const nameInput = screen.getByPlaceholder('Product name');
    await expect.element(nameInput).toHaveValue('4x4 Welded Wire 50x50');

    const skuInput = screen.getByPlaceholder('SKU code');
    await expect.element(skuInput).toHaveValue('TS-5050');
  });
});
