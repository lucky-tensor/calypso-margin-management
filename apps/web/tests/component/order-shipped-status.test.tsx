import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { OrderHistory } from '../../src/components/OrderHistory';
import { AuthProvider } from '../../src/context/AuthContext';

const fixtureConfirmedOrder = {
  id: 'order-confirmed-1',
  created_at: '2025-01-14T08:00:00Z',
  properties: {
    customer: 'Beta Supplies',
    product_id: 'prod-1',
    product_name: '4x4 Welded Wire Mesh',
    quantity: 5,
    unit_of_measure: 'linear_foot',
    sell_price_per_unit: 20,
    qty_eaches: 5,
    qty_linft: 50,
    qty_sqft: 200,
    total_revenue: 1000,
    total_cost: 900,
    margin_dollars: 100,
    margin_percent: 10,
    margin_target: 25,
    margin_floor: 15,
    qty_on_hand_eaches: 0,
    safety_stock_eaches: 0,
    reorder_point_eaches: 0,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
    status: 'confirmed',
    notes: '',
    stock_position_at_creation: null,
    stock_warning: null,
    created_by: 'test-user',
    confirmed_by: 'admin',
    confirmed_at: '2025-01-14T09:00:00Z',
    cancelled_by: null,
    cancelled_at: null,
    shipped_by: null,
    shipped_at: null,
  },
};

const fixtureShippedOrder = {
  id: 'order-shipped-1',
  created_at: '2025-01-12T06:00:00Z',
  properties: {
    customer: 'Delta Logistics',
    product_id: 'prod-1',
    product_name: '4x4 Welded Wire Mesh',
    quantity: 8,
    unit_of_measure: 'each',
    sell_price_per_unit: 50,
    qty_eaches: 8,
    qty_linft: 80,
    qty_sqft: 320,
    total_revenue: 400,
    total_cost: 300,
    margin_dollars: 100,
    margin_percent: 25,
    margin_target: 25,
    margin_floor: 15,
    qty_on_hand_eaches: 0,
    safety_stock_eaches: 0,
    reorder_point_eaches: 0,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
    status: 'shipped',
    notes: '',
    stock_position_at_creation: {
      qty_on_hand: 20,
      committed_qty: 5,
      pending_qty: 2,
      net_available: 13,
      effective_available: 11,
      status: 'ok',
      reorder_point: 5,
      safety_stock: 3,
      reorder_qty: 10,
      lead_time_days: 7,
      days_of_stock: null,
    },
    stock_warning: null,
    created_by: 'test-user',
    confirmed_by: 'admin',
    confirmed_at: '2025-01-12T07:00:00Z',
    cancelled_by: null,
    cancelled_at: null,
    shipped_by: 'inv_manager',
    shipped_at: '2025-01-13T10:00:00Z',
  },
};

describe('OrderHistory — shipped status', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('inventory_manager sees Mark Shipped button on confirmed order', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager', orders: [fixtureConfirmedOrder] },
    });

    const screen = render(
      <AuthProvider>
        <OrderHistory />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Mark Shipped' })).toBeVisible();
  });

  test('sales_rep does not see Mark Shipped button on confirmed order', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'sales_rep', orders: [fixtureConfirmedOrder] },
    });

    const screen = render(
      <AuthProvider>
        <OrderHistory />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Mark Shipped' }))
      .not.toBeInTheDocument();
  });

  test('clicking Mark Shipped shows confirmation dialog', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager', orders: [fixtureConfirmedOrder] },
    });

    const screen = render(
      <AuthProvider>
        <OrderHistory />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
    await screen.getByRole('button', { name: 'Mark Shipped' }).click();

    await expect
      .element(screen.getByText('Mark this order as shipped? This will decrement stock.'))
      .toBeVisible();
  });

  test('shipped filter shows only shipped orders', async () => {
    await commands.setFixtureState({
      state: {
        currentRole: 'sales_rep',
        orders: [fixtureConfirmedOrder, fixtureShippedOrder],
      },
    });

    const screen = render(
      <AuthProvider>
        <OrderHistory />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
    await expect.element(screen.getByText('Delta Logistics')).toBeVisible();

    await screen.getByRole('button', { name: 'Shipped' }).click();

    await expect.element(screen.getByText('Delta Logistics')).toBeVisible();
    await expect.element(screen.getByText('Beta Supplies')).not.toBeInTheDocument();
  });

  test('shipped order shows shipped_by audit field', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'sales_rep', orders: [fixtureShippedOrder] },
    });

    const screen = render(
      <AuthProvider>
        <OrderHistory />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Delta Logistics')).toBeVisible();
    await expect.element(screen.getByText(/inv_manager/)).toBeVisible();
  });

  test('shipped order shows stock_position_at_creation snapshot', async () => {
    await commands.setFixtureState({
      state: { currentRole: 'inventory_manager', orders: [fixtureShippedOrder] },
    });

    const screen = render(
      <AuthProvider>
        <OrderHistory />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Delta Logistics')).toBeVisible();
    // stock_position_at_creation.net_available = 13
    await expect.element(screen.getByText('13 ea')).toBeVisible();
  });
});
