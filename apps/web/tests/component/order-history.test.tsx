import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { OrderHistory } from '../../src/components/OrderHistory';
import type { Order } from 'core';

const fixtureDraftOrder: Order = {
  id: 'order-draft-1',
  created_at: '2025-01-15T10:00:00Z',
  properties: {
    customer: 'Acme Fencing Co',
    product_id: 'prod-1',
    product_name: '4x4 Welded Wire Mesh',
    quantity: 10,
    unit_of_measure: 'each',
    sell_price_per_unit: 45,
    qty_eaches: 10,
    qty_linft: 100,
    qty_sqft: 400,
    total_revenue: 450,
    total_cost: 320,
    margin_dollars: 130,
    margin_percent: 28.89,
    margin_target: 25,
    margin_floor: 15,
    status: 'draft',
    notes: '',
    created_by: 'test-user',
    confirmed_by: null,
    confirmed_at: null,
    cancelled_by: null,
    cancelled_at: null,
  },
};

const fixtureConfirmedOrder: Order = {
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
    status: 'confirmed',
    notes: '',
    created_by: 'test-user',
    confirmed_by: 'admin',
    confirmed_at: '2025-01-14T09:00:00Z',
    cancelled_by: null,
    cancelled_at: null,
  },
};

const fixtureCancelledOrder: Order = {
  id: 'order-cancelled-1',
  created_at: '2025-01-13T07:00:00Z',
  properties: {
    customer: 'Gamma Corp',
    product_id: 'prod-1',
    product_name: '4x4 Welded Wire Mesh',
    quantity: 3,
    unit_of_measure: 'square_foot',
    sell_price_per_unit: 5,
    qty_eaches: 3,
    qty_linft: 30,
    qty_sqft: 120,
    total_revenue: 600,
    total_cost: 480,
    margin_dollars: 120,
    margin_percent: 20,
    margin_target: 25,
    margin_floor: 15,
    status: 'cancelled',
    notes: '',
    created_by: 'test-user',
    confirmed_by: null,
    confirmed_at: null,
    cancelled_by: 'manager',
    cancelled_at: '2025-01-13T10:00:00Z',
  },
};

describe('OrderHistory', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('shows empty state when no orders exist', async () => {
    await commands.setFixtureState({ state: { orders: [] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('No orders found.')).toBeVisible();
  });

  test('renders order table with correct columns', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Order History')).toBeVisible();
    await expect.element(screen.getByText('Date')).toBeVisible();
    await expect.element(screen.getByText('Customer')).toBeVisible();
    await expect.element(screen.getByText('Product')).toBeVisible();
    await expect.element(screen.getByText('Qty')).toBeVisible();
    await expect.element(screen.getByText('UOM')).toBeVisible();
    await expect.element(screen.getByText('Revenue')).toBeVisible();
    await expect.element(screen.getByText('Cost')).toBeVisible();
    await expect.element(screen.getByText('Margin %')).toBeVisible();
    await expect.element(screen.getByText('Status')).toBeVisible();
  });

  test('displays order data in table rows', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await expect.element(screen.getByText('4x4 Welded Wire Mesh')).toBeVisible();
    await expect.element(screen.getByRole('cell', { name: 'Draft' })).toBeVisible();
  });

  test('margin % is green when at or above target', async () => {
    // fixtureDraftOrder has 28.89% margin, target 25% => healthy/green
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    // Wait for table to appear
    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();

    // The margin cell text should have emerald color class
    const marginEl = screen.getByText(/28\.9%/);
    await expect.element(marginEl).toBeVisible();
    const el = marginEl.element();
    expect(el.className).toContain('text-emerald-700');
  });

  test('margin % is yellow when between floor and target', async () => {
    // fixtureCancelledOrder has 20% margin, target 25%, floor 15% => warning/amber
    await commands.setFixtureState({ state: { orders: [fixtureCancelledOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Gamma Corp')).toBeVisible();

    const marginEl = screen.getByText(/20\.0%/);
    await expect.element(marginEl).toBeVisible();
    const el = marginEl.element();
    expect(el.className).toContain('text-amber-700');
  });

  test('margin % is red when below floor', async () => {
    // fixtureConfirmedOrder has 10% margin, target 25%, floor 15% => critical/red
    await commands.setFixtureState({ state: { orders: [fixtureConfirmedOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();

    const marginEl = screen.getByText(/10\.0%/);
    await expect.element(marginEl).toBeVisible();
    const el = marginEl.element();
    expect(el.className).toContain('text-red-700');
  });

  test('status filter tabs show only matching orders', async () => {
    await commands.setFixtureState({
      state: { orders: [fixtureDraftOrder, fixtureConfirmedOrder, fixtureCancelledOrder] },
    });

    const screen = render(<OrderHistory />);

    // All orders visible initially
    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
    await expect.element(screen.getByText('Gamma Corp')).toBeVisible();

    // Click "Draft" tab
    await screen.getByRole('button', { name: 'Draft' }).click();

    // Only draft order should be visible
    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await expect.element(screen.getByText('Beta Supplies')).not.toBeInTheDocument();
    await expect.element(screen.getByText('Gamma Corp')).not.toBeInTheDocument();
  });

  test('status filter tab Confirmed shows only confirmed orders', async () => {
    await commands.setFixtureState({
      state: { orders: [fixtureDraftOrder, fixtureConfirmedOrder, fixtureCancelledOrder] },
    });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();

    await screen.getByRole('button', { name: 'Confirmed' }).click();

    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
    await expect.element(screen.getByText('Acme Fencing Co')).not.toBeInTheDocument();
    await expect.element(screen.getByText('Gamma Corp')).not.toBeInTheDocument();
  });

  test('customer filter narrows results by customer name', async () => {
    await commands.setFixtureState({
      state: { orders: [fixtureDraftOrder, fixtureConfirmedOrder] },
    });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();

    await screen.getByLabelText('Filter by customer').fill('Acme');

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await expect.element(screen.getByText('Beta Supplies')).not.toBeInTheDocument();
  });

  test('draft order has Confirm and Cancel buttons', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('confirmed order has only Cancel button', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureConfirmedOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  test('cancelled order has no action buttons', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureCancelledOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Gamma Corp')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  test('Confirm button shows confirmation dialog', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await screen.getByRole('button', { name: 'Confirm' }).click();

    await expect.element(screen.getByText('Confirm this order?')).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Confirm cancellation' }))
      .toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Go back' })).toBeVisible();
  });

  test('Cancel button shows confirmation dialog', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await screen.getByRole('button', { name: 'Cancel' }).click();

    await expect.element(screen.getByText(/Cancel this order/)).toBeVisible();
  });

  test('confirming an order updates the row status', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await screen.getByRole('button', { name: 'Confirm' }).click();

    // Dialog appears — confirm
    await expect
      .element(screen.getByRole('button', { name: 'Confirm cancellation' }))
      .toBeVisible();
    await screen.getByRole('button', { name: 'Confirm cancellation' }).click();

    // Row should now show "Confirmed"
    await expect.element(screen.getByText('Confirmed')).toBeVisible();
  });

  test('cancelling an order updates the row status', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureDraftOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await screen.getByRole('button', { name: 'Cancel' }).click();

    // Dialog appears — confirm cancel
    await expect.element(screen.getByText(/Cancel this order/)).toBeVisible();
    await screen.getByRole('button', { name: 'Confirm cancellation' }).click();

    // Row should now show "Cancelled"
    await expect.element(screen.getByText('Cancelled')).toBeVisible();
  });

  test('confirmed order shows audit info', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureConfirmedOrder] } });

    const screen = render(<OrderHistory />);

    // Audit info shows "admin at ..."
    await expect.element(screen.getByText(/admin/)).toBeVisible();
  });

  test('cancelled order shows audit info', async () => {
    await commands.setFixtureState({ state: { orders: [fixtureCancelledOrder] } });

    const screen = render(<OrderHistory />);

    await expect.element(screen.getByText(/manager/)).toBeVisible();
  });

  test('All tab shows all orders after filtering', async () => {
    await commands.setFixtureState({
      state: { orders: [fixtureDraftOrder, fixtureConfirmedOrder] },
    });

    const screen = render(<OrderHistory />);

    // Select only draft
    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await screen.getByRole('button', { name: 'Draft' }).click();
    await expect.element(screen.getByText('Acme Fencing Co')).toBeVisible();
    await expect.element(screen.getByText('Beta Supplies')).not.toBeInTheDocument();

    // Switch back to All
    await screen.getByRole('button', { name: 'All' }).click();
    await expect.element(screen.getByText('Beta Supplies')).toBeVisible();
  });
});
