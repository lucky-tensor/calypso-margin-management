import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { AuthProvider } from '../../src/context/AuthContext';
import { RoleGate } from '../../src/components/RoleGate';
import App from '../../src/App';
import { ProductCatalog } from '../../src/components/ProductCatalog';

describe('RoleGate component', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('hides content from sales_rep when role="inventory_manager"', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'sales_rep' },
    });

    const screen = render(
      <AuthProvider>
        <RoleGate role="inventory_manager">
          <span data-testid="secret">Manager Only</span>
        </RoleGate>
      </AuthProvider>,
    );

    // Wait for auth to settle — the secret content should not be present
    await expect.element(screen.getByTestId('secret')).not.toBeInTheDocument();
  });

  test('shows content to inventory_manager when role="inventory_manager"', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <RoleGate role="inventory_manager">
          <span data-testid="secret">Manager Only</span>
        </RoleGate>
      </AuthProvider>,
    );

    await expect.element(screen.getByTestId('secret')).toBeVisible();
  });

  test('shows content to admin when role="inventory_manager"', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'admin' },
    });

    const screen = render(
      <AuthProvider>
        <RoleGate role="inventory_manager">
          <span data-testid="secret">Manager Only</span>
        </RoleGate>
      </AuthProvider>,
    );

    await expect.element(screen.getByTestId('secret')).toBeVisible();
  });

  test('hides content from sales_rep and inventory_manager when role="admin"', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'sales_rep' },
    });

    const screen = render(
      <AuthProvider>
        <RoleGate role="admin">
          <span data-testid="admin-only">Admin Only</span>
        </RoleGate>
      </AuthProvider>,
    );

    await expect.element(screen.getByTestId('admin-only')).not.toBeInTheDocument();
  });

  test('hides content from inventory_manager when role="admin"', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager' },
    });

    const screen = render(
      <AuthProvider>
        <RoleGate role="admin">
          <span data-testid="admin-only">Admin Only</span>
        </RoleGate>
      </AuthProvider>,
    );

    await expect.element(screen.getByTestId('admin-only')).not.toBeInTheDocument();
  });
});

describe('Nav role filtering', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('sales_rep does not see Inventory nav item', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'sales_rep', products: [], orders: [] },
    });

    const screen = render(<App />);

    // Wait for app to load (not the loading spinner)
    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();

    // Inventory nav item should not be present
    await expect.element(screen.getByTitle('Inventory')).not.toBeInTheDocument();
  });

  test('inventory_manager sees Inventory nav item', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager', products: [], orders: [] },
    });

    const screen = render(<App />);

    // Wait for app to load
    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();

    // Inventory nav item should be visible
    await expect.element(screen.getByTitle('Inventory')).toBeVisible();
  });
});

describe('Products view role-based buttons', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('sales_rep sees no Add Product button on Products view', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'sales_rep', products: [] },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    // Wait for catalog to load
    await expect.element(screen.getByText(/No products yet/)).toBeVisible();

    // Add Product button should not be present for sales_rep
    await expect
      .element(screen.getByRole('button', { name: 'Add Product' }))
      .not.toBeInTheDocument();
  });

  test('inventory_manager sees Add Product button on Products view', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager', products: [] },
    });

    const screen = render(
      <AuthProvider>
        <ProductCatalog />
      </AuthProvider>,
    );

    await expect.element(screen.getByText(/No products yet/)).toBeVisible();

    await expect.element(screen.getByRole('button', { name: 'Add Product' })).toBeVisible();
  });
});
