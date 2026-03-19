import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands } from '@vitest/browser/context';
import React from 'react';
import { OrderEntry } from '../../src/components/OrderEntry';
import type { Product } from 'core';

const fixtureProduct: Product = {
  id: 'prod-1',
  created_at: '2024-01-01T00:00:00Z',
  properties: {
    name: '4x4 Welded Wire Mesh',
    sku: 'WM-4X4-10GA',
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
  },
};

const PRODUCT_OPTION = '4x4 Welded Wire Mesh (WM-4X4-10GA)';

async function waitAndSelectProduct(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('option', { name: PRODUCT_OPTION })).toBeVisible();
  await screen.getByLabelText('Product').selectOptions(PRODUCT_OPTION);
}

describe('OrderEntry', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('shows empty state prompt when no products exist', async () => {
    await commands.setFixtureState({ state: { products: [] } });

    const screen = render(<OrderEntry />);

    await expect.element(screen.getByText(/No products found/)).toBeVisible();
    await expect.element(screen.getByText(/Add products in the catalog/)).toBeVisible();
  });

  test('selecting a product shows product context line', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);

    await expect.element(screen.getByText(/1 unit = 48" × 120"/)).toBeVisible();
    await expect.element(screen.getByText(/Galvanized Steel/)).toBeVisible();
  });

  test('entering quantity and UOM shows converted quantities in all three units', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // Default UOM is square_foot; 200 sqft = 5 eaches = 50 linear feet
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('1.20');

    await expect.element(screen.getByText(/5.*units/)).toBeVisible();
    await expect.element(screen.getByText(/50.*lin ft/)).toBeVisible();
    await expect.element(screen.getByText(/200.*sq ft/)).toBeVisible();
  });

  test('entering sell price shows revenue, cost, and margin', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft at $1.20/sqft: Revenue = 240, Cost = 5 × 32 = 160, Margin = 80/240 = 33.3%
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('1.20');

    await expect.element(screen.getByText(/240/)).toBeVisible();
    await expect.element(screen.getByText(/160/)).toBeVisible();
    await expect.element(screen.getByText(/33\.3%/)).toBeVisible();
  });

  test('margin display is green when at or above target', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft at $1.20/sqft → 33.3% margin — above 25% target → healthy/green
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('1.20');

    const marginSection = screen.getByText('33.3%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin display is yellow when between floor and target', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft at $1.00/sqft: Revenue = 200, Cost = 160, Margin = 40/200 = 20% — between 15% floor and 25% target
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('1.00');

    const marginSection = screen.getByText('20.0%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-amber-50')).not.toBeNull();
  });

  test('margin display is red when below floor', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft at $0.90/sqft: Revenue = 180, Cost = 160, Margin = 20/180 = 11.1% — below 15% floor
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('0.90');

    const marginSection = screen.getByText('11.1%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-red-50')).not.toBeNull();
  });

  test('fractional eaches trigger warning message', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    await screen.getByLabelText('Unit of measure').selectOptions('Linear ft');
    // 73 linear feet / 10 ft per each = 7.3 eaches (fractional)
    await screen.getByLabelText('Quantity').fill('73');
    await screen.getByLabelText('Sell price per unit ($)').fill('4.80');

    await expect.element(screen.getByText(/Fractional unit/)).toBeVisible();
  });

  test('non-fractional eaches do not show warning', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches (integer) — no fractional warning
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('1.20');

    await expect.element(screen.getByText(/Fractional unit/)).not.toBeInTheDocument();
  });

  test('Confirm Order submits to API and resets form on success', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Customer').fill('Acme Fencing Co');
    await waitAndSelectProduct(screen);
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per unit ($)').fill('1.20');

    await screen.getByRole('button', { name: 'Confirm Order' }).click();

    // Should show success message
    await expect.element(screen.getByText(/Order confirmed successfully/)).toBeVisible();

    // Form should reset — customer field should be empty
    await expect.element(screen.getByLabelText('Customer')).toHaveValue('');
  });

  test('tab order navigates through fields correctly', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    // Wait for products to load
    await expect.element(screen.getByLabelText('Customer')).toBeVisible();

    // Verify all tab-navigable inputs are present
    await expect.element(screen.getByLabelText('Customer')).toHaveAttribute('tabindex', '1');
    await expect.element(screen.getByLabelText('Product')).toHaveAttribute('tabindex', '2');
    await expect.element(screen.getByLabelText('Quantity')).toHaveAttribute('tabindex', '3');
    await expect.element(screen.getByLabelText('Unit of measure')).toHaveAttribute('tabindex', '4');
    await expect
      .element(screen.getByLabelText('Sell price per unit ($)'))
      .toHaveAttribute('tabindex', '5');
    await expect
      .element(screen.getByRole('button', { name: 'Confirm Order' }))
      .toHaveAttribute('tabindex', '6');
  });
});
