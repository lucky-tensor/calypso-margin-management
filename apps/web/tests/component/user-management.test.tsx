import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import App from '../../src/App';
import { AuthProvider } from '../../src/context/AuthContext';
import { UsersView } from '../../src/components/UsersView';

const SAMPLE_USERS = [
  { id: 'user-1', username: 'alice', role: 'admin' as const, display_name: 'Alice Admin' },
  { id: 'user-2', username: 'bob', role: 'sales_rep' as const, display_name: 'Bob Sales' },
  {
    id: 'user-3',
    username: 'carol',
    role: 'inventory_manager' as const,
    display_name: 'Carol Inv',
  },
];

describe('Users nav item visibility', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('admin sees Users nav item', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'admin', products: [], orders: [], users: SAMPLE_USERS },
    });

    const screen = render(<App />);

    // Wait for app to load
    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();

    // Users nav item should be visible for admin
    await expect.element(screen.getByTitle('Users')).toBeVisible();
  });

  test('inv_manager does not see Users nav item', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager', products: [], orders: [] },
    });

    const screen = render(<App />);

    // Wait for app to load
    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();

    // Users nav item should NOT be visible for inventory_manager
    await expect.element(screen.getByTitle('Users')).not.toBeInTheDocument();
  });

  test('sales_rep does not see Users nav item', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'sales_rep', products: [], orders: [] },
    });

    const screen = render(<App />);

    // Wait for app to load
    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();

    // Users nav item should NOT be visible for sales_rep
    await expect.element(screen.getByTitle('Users')).not.toBeInTheDocument();
  });
});

describe('Users view table', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('admin can navigate to Users view and see the user table', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'admin', products: [], orders: [], users: SAMPLE_USERS },
    });

    const screen = render(<App />);

    // Wait for app to load
    await expect.element(screen.getByTitle('Order Entry')).toBeVisible();

    // Navigate to Users
    await screen.getByTitle('Users').click();

    // Table headers should be visible
    await expect.element(screen.getByText('Username')).toBeVisible();
    await expect.element(screen.getByText('Display Name')).toBeVisible();
    await expect.element(screen.getByText('Role')).toBeVisible();

    // Users should be listed
    await expect.element(screen.getByText('alice')).toBeVisible();
    await expect.element(screen.getByText('bob')).toBeVisible();
    await expect.element(screen.getByText('carol')).toBeVisible();
  });

  test('UsersView table lists all users without password hashes', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'admin', users: SAMPLE_USERS },
    });

    const screen = render(
      <AuthProvider>
        <UsersView />
      </AuthProvider>,
    );

    // All users should appear
    await expect.element(screen.getByText('alice')).toBeVisible();
    await expect.element(screen.getByText('Bob Sales')).toBeVisible();
    await expect.element(screen.getByText('Carol Inv')).toBeVisible();

    // No password hash fields should appear
    await expect.element(screen.getByText('password_hash')).not.toBeInTheDocument();
    await expect.element(screen.getByText('password')).not.toBeInTheDocument();
  });
});

describe('Users view role change', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('admin can change a user role via edit dialog and table updates', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'admin',
        users: [{ id: 'user-1', username: 'bob', role: 'sales_rep', display_name: 'Bob Sales' }],
      },
    });

    const screen = render(
      <AuthProvider>
        <UsersView />
      </AuthProvider>,
    );

    // Wait for table to load
    await expect.element(screen.getByText('bob')).toBeVisible();

    // Bob should have sales_rep role
    await expect.element(screen.getByText('Sales Rep')).toBeVisible();

    // Click Edit on the first user
    await screen.getByRole('button', { name: 'Edit' }).click();

    // Edit dialog should appear
    await expect.element(screen.getByLabelText('Role')).toBeVisible();

    // Change role to inventory_manager
    await screen.getByRole('combobox', { name: 'Role' }).selectOptions('inventory_manager');

    // Save
    await screen.getByRole('button', { name: 'Save' }).click();

    // Dialog should close and table should show updated role
    await expect.element(screen.getByText('Inventory Manager')).toBeVisible();

    // Sales Rep badge should be gone
    await expect.element(screen.getByText('Sales Rep')).not.toBeInTheDocument();
  });
});
