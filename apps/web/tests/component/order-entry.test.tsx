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
    qty_on_hand_eaches: 0,
    safety_stock_eaches: 0,
    reorder_point_eaches: 0,
    reorder_qty_eaches: null,
    lead_time_days: null,
    pending_order_weight: 0.7,
  },
};

// sqftPerEach = (48 * 120) / 144 = 40
// linftPerEach = 120 / 12 = 10
// targetMarginPricePerEach = 32 / (1 - 0.25) = 42.666... => "42.67"

const PRODUCT_OPTION = '4x4 Welded Wire Mesh (WM-4X4-10GA)';

async function waitAndSelectProduct(screen: ReturnType<typeof render>) {
  await expect.element(screen.getByRole('option', { name: PRODUCT_OPTION })).toBeVisible();
  await screen.getByLabelText('Product').selectOptions(PRODUCT_OPTION);
}

describe('OrderEntry — Specific Product mode', () => {
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

  test('sell price label reads "Sell price per roll ($)"', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);

    await expect.element(screen.getByLabelText('Sell price per roll ($)')).toBeVisible();
  });

  test('default sell price on product selection is target-margin per-each rate', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);

    // 32 / (1 - 0.25) = 42.666... => "42.67"
    await expect.element(screen.getByLabelText('Sell price per roll ($)')).toHaveValue(42.67);
  });

  test('entering quantity and UOM shows converted quantities in all three units', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // Default UOM is square_foot; 200 sqft = 5 eaches = 50 linear feet
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    await expect.element(screen.getByText(/5.*units/)).toBeVisible();
    await expect.element(screen.getByText(/50.*lin ft/)).toBeVisible();
    await expect.element(screen.getByText(/200.*sq ft/)).toBeVisible();
  });

  test('equivalent per-sqft and per-linft rates display below sell price input', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // With $42.67/each, sqftPerEach=40, linftPerEach=10:
    // pricePerSqft = 42.67 / 40 = 1.07, pricePerLinft = 42.67 / 10 = 4.27
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    await expect.element(screen.getByText(/\$1\.07 \/ sqft/)).toBeVisible();
    await expect.element(screen.getByText(/\$4\.27 \/ linft/)).toBeVisible();
  });

  test('revenue = qty_eaches x sell_price_per_each', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches; $42.67/each => revenue = 5 * 42.67 = 213.35
    // cost = 5 * 32 = 160; margin = (213.35 - 160) / 213.35 = 25%
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    await expect.element(screen.getByText(/213\.35/)).toBeVisible();
    await expect.element(screen.getByText(/160/)).toBeVisible();
  });

  test('entering sell price shows revenue, cost, and margin', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches at $50/each: Revenue = 250, Cost = 5 × 32 = 160, Margin = 90/250 = 36%
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('50');

    await expect.element(screen.getByText(/250/)).toBeVisible();
    await expect.element(screen.getByText(/160/)).toBeVisible();
    await expect.element(screen.getByText(/36\.0%/)).toBeVisible();
  });

  test('margin display is green when at or above target', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches at $50/each → 36% margin — above 25% target → healthy/green
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('50');

    const marginSection = screen.getByText('36.0%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin display is yellow when between floor and target', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches at $38/each: Revenue = 190, Cost = 160, Margin = 30/190 = 15.8% — between 15% floor and 25% target
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('38');

    const marginSection = screen.getByText('15.8%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-amber-50')).not.toBeNull();
  });

  test('margin display is red when below floor', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches at $36/each: Revenue = 180, Cost = 160, Margin = 20/180 = 11.1% — below 15% floor
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('36');

    const marginSection = screen.getByText('11.1%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-red-50')).not.toBeNull();
  });

  test('fractional eaches show round-up and round-down buttons', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 100 sqft / 40 sqft per each = 2.5 eaches (fractional)
    await screen.getByLabelText('Quantity').fill('100');
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    // ceil(2.5) = 3, 3 * 40 = 120 sqft; floor(2.5) = 2, 2 * 40 = 80 sqft
    await expect
      .element(screen.getByRole('button', { name: /Round up to 3 eaches \(120 sqft\)/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: /Round down to 2 eaches \(80 sqft\)/ }))
      .toBeVisible();
  });

  test('clicking round up updates quantity and removes buttons', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    await screen.getByLabelText('Quantity').fill('100');
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    await screen.getByRole('button', { name: /Round up to 3 eaches \(120 sqft\)/ }).click();

    // Quantity should be updated to 120 (3 eaches * 40 sqft)
    await expect.element(screen.getByLabelText('Quantity')).toHaveValue(120);
    // Rounding buttons should disappear (3 eaches is whole)
    await expect.element(screen.getByRole('button', { name: /Round up/ })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: /Round down/ }))
      .not.toBeInTheDocument();
  });

  test('clicking round down updates quantity and removes buttons', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    await screen.getByLabelText('Quantity').fill('100');
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    await screen.getByRole('button', { name: /Round down to 2 eaches \(80 sqft\)/ }).click();

    // Quantity should be updated to 80 (2 eaches * 40 sqft)
    await expect.element(screen.getByLabelText('Quantity')).toHaveValue(80);
    // Rounding buttons should disappear (2 eaches is whole)
    await expect.element(screen.getByRole('button', { name: /Round up/ })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: /Round down/ }))
      .not.toBeInTheDocument();
  });

  test('whole eaches show no rounding buttons', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches (integer) — no rounding buttons
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    await expect.element(screen.getByRole('button', { name: /Round up/ })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: /Round down/ }))
      .not.toBeInTheDocument();
  });

  test('Confirm Order submits to API and resets form on success', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Customer').fill('Acme Fencing Co');
    await waitAndSelectProduct(screen);
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('50');

    await screen.getByRole('button', { name: 'Confirm Order' }).click();

    // Should show unified success banner
    await expect.element(screen.getByText(/Order confirmed!/)).toBeVisible();
    // "New Order" and "View Orders" buttons should appear
    await expect.element(screen.getByRole('button', { name: 'New Order' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'View Orders' })).toBeVisible();
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
      .element(screen.getByLabelText('Sell price per roll ($)'))
      .toHaveAttribute('tabindex', '5');
    await expect
      .element(screen.getByRole('button', { name: 'Confirm Order' }))
      .toHaveAttribute('tabindex', '6');
  });

  test('margin box is green (emerald) when auto-seeded sell price is selected at target margin', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // Use the auto-seeded price (target-margin rate) and enter a quantity
    // The seeded price must yield >= 25% margin so the margin box should be green
    await screen.getByLabelText('Quantity').fill('200');
    // The sell price input should already be seeded with the target-margin price

    // Confirm the margin percent displayed rounds to 25.0% or above
    const marginPercentEl = screen.getByText(/25\.0%|2[6-9]\.\d%|[3-9]\d\.\d%/);
    await expect.element(marginPercentEl).toBeVisible();
    const el = marginPercentEl.element();
    expect(el.closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin box is green when displayed margin rounds to target (Fix 2: display-aligned color)', async () => {
    // This test verifies that when margin_percent rounds to exactly the target (e.g. 25.0%),
    // the margin box is green (emerald), not amber — fixing the display/color mismatch.
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await waitAndSelectProduct(screen);
    // 200 sqft = 5 eaches at $42.67/each:
    // Revenue = 5 * 42.67 = 213.35, Cost = 5 * 32 = 160
    // Margin = 53.35 / 213.35 = 24.9941...% — displays as "25.0%" but raw is below 25%
    // Fix 2 ensures evaluateMargin uses the rounded display value → healthy/green
    await screen.getByLabelText('Quantity').fill('200');
    await screen.getByLabelText('Sell price per roll ($)').fill('42.67');

    const marginSection = screen.getByText('25.0%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-emerald-50')).not.toBeNull();
  });

  test('mode selector shows exactly two tabs: "Specific Product" and "Search by UoM"', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await expect.element(screen.getByRole('button', { name: 'Specific Product' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Search by UoM' })).toBeVisible();

    // Old tabs should not exist
    await expect
      .element(screen.getByRole('button', { name: 'By Product' }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'By Width' })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'By Area' })).not.toBeInTheDocument();
  });
});
