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
    name: 'Tela Soldada 4x4',
    sku: 'TS-4X4-10GA',
    material: 'Aco Galvanizado',
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

describe('OrderEntry', () => {
  beforeEach(async () => {
    await commands.resetFixtureState();
  });

  test('shows empty state prompt when no products exist', async () => {
    await commands.setFixtureState({ state: { products: [] } });

    const screen = render(<OrderEntry />);

    await expect.element(screen.getByText(/Nenhum produto cadastrado/)).toBeVisible();
    await expect.element(screen.getByText(/Adicione produtos no catalogo/)).toBeVisible();
  });

  test('selecting a product shows product context line', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');

    await expect.element(screen.getByText(/1 unidade = 48" × 120"/)).toBeVisible();
    await expect.element(screen.getByText(/Aco Galvanizado/)).toBeVisible();
  });

  test('entering quantity and UOM shows converted quantities in all three units', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Quantidade').fill('10');
    await screen.getByLabelText('Preco por unidade (R$)').fill('45');

    // 10 eaches = 100 linear feet = 400 square feet
    await expect.element(screen.getByText(/10.*unidades/)).toBeVisible();
    await expect.element(screen.getByText(/100.*pes lineares/)).toBeVisible();
    await expect.element(screen.getByText(/400.*pes quadrados/)).toBeVisible();
  });

  test('entering sell price shows revenue, cost, and margin', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Quantidade').fill('10');
    await screen.getByLabelText('Preco por unidade (R$)').fill('45');

    // Revenue: 10 * 45 = 450, Cost: 10 * 32 = 320, Margin: 130 / 450 = 28.9%
    await expect.element(screen.getByText(/450/)).toBeVisible();
    await expect.element(screen.getByText(/320/)).toBeVisible();
    await expect.element(screen.getByText(/28,9%/)).toBeVisible();
  });

  test('margin display is green when at or above target', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Quantidade').fill('10');
    // 28.9% margin — above 25% target → healthy/green
    await screen.getByLabelText('Preco por unidade (R$)').fill('45');

    // The margin box should have emerald color classes
    const marginSection = screen.getByText('28,9%');
    await expect.element(marginSection).toBeVisible();
    // Check the parent container has emerald styling via the percent element
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-emerald-50')).not.toBeNull();
  });

  test('margin display is yellow when between floor and target', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Quantidade').fill('10');
    // To get ~20% margin: revenue = cost / (1 - 0.20) = 320 / 0.80 = 400, price per each = 40
    // Actual: 10 * 40 = 400 revenue, 10 * 32 = 320 cost, margin = 80/400 = 20% — between 15% floor and 25% target
    await screen.getByLabelText('Preco por unidade (R$)').fill('40');

    const marginSection = screen.getByText('20,0%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-amber-50')).not.toBeNull();
  });

  test('margin display is red when below floor', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Quantidade').fill('10');
    // To get < 15% margin: price = 35, revenue = 350, cost = 320, margin = 30/350 = 8.6%
    await screen.getByLabelText('Preco por unidade (R$)').fill('35');

    const marginSection = screen.getByText('8,6%');
    await expect.element(marginSection).toBeVisible();
    const marginEl = marginSection.element();
    expect(marginEl.closest('.bg-red-50')).not.toBeNull();
  });

  test('fractional eaches trigger warning message', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Unid. de medida').selectOptions('Pe linear');
    // 73 linear feet / 10 ft per each = 7.3 eaches (fractional)
    await screen.getByLabelText('Quantidade').fill('73');
    await screen.getByLabelText('Preco por unidade (R$)').fill('4.80');

    await expect.element(screen.getByText(/Unidade fracionada/)).toBeVisible();
  });

  test('non-fractional eaches do not show warning', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Quantidade').fill('10');
    await screen.getByLabelText('Preco por unidade (R$)').fill('45');

    // 10 eaches — no fractional warning
    await expect.element(screen.getByText(/Unidade fracionada/)).not.toBeInTheDocument();
  });

  test('Confirmar Pedido submits to API and resets form on success', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    await screen.getByLabelText('Cliente').fill('Acme Fencing Co');
    await screen.getByLabelText('Produto').selectOptions('Tela Soldada 4x4 (TS-4X4-10GA)');
    await screen.getByLabelText('Quantidade').fill('10');
    await screen.getByLabelText('Preco por unidade (R$)').fill('45');

    await screen.getByRole('button', { name: 'Confirmar Pedido' }).click();

    // Should show success message
    await expect.element(screen.getByText(/Pedido confirmado com sucesso/)).toBeVisible();

    // Form should reset — customer field should be empty
    await expect.element(screen.getByLabelText('Cliente')).toHaveValue('');
  });

  test('tab order navigates through fields correctly', async () => {
    await commands.setFixtureState({ state: { products: [fixtureProduct] } });

    const screen = render(<OrderEntry />);

    // Wait for products to load
    await expect.element(screen.getByLabelText('Cliente')).toBeVisible();

    // Verify all tab-navigable inputs are present
    await expect.element(screen.getByLabelText('Cliente')).toHaveAttribute('tabindex', '1');
    await expect.element(screen.getByLabelText('Produto')).toHaveAttribute('tabindex', '2');
    await expect.element(screen.getByLabelText('Quantidade')).toHaveAttribute('tabindex', '3');
    await expect.element(screen.getByLabelText('Unid. de medida')).toHaveAttribute('tabindex', '4');
    await expect
      .element(screen.getByLabelText('Preco por unidade (R$)'))
      .toHaveAttribute('tabindex', '5');
    await expect
      .element(screen.getByRole('button', { name: 'Confirmar Pedido' }))
      .toHaveAttribute('tabindex', '6');
  });
});
