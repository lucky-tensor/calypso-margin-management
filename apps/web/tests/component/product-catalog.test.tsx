import { test, expect, describe, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { commands, page } from '@vitest/browser/context';
import React from 'react';
import { ProductCatalog } from '../../src/components/ProductCatalog';
import type { Product } from 'core';

const fixtureProducts: Product[] = [
  {
    id: 'prod-1',
    created_at: '2024-01-01T00:00:00Z',
    properties: {
      name: 'Tela Soldada 50x50',
      sku: 'TS-5050',
      material: 'Aco Galvanizado',
      width_inches: 48,
      length_inches: 96,
      weight_per_sqft: 1.5,
      cost_per_each: 25.0,
      cost_per_linft: null,
      cost_per_sqft: null,
      primary_cost_basis: 'each',
      margin_target: 25,
      margin_floor: 15,
    },
  },
  {
    id: 'prod-2',
    created_at: '2024-01-02T00:00:00Z',
    properties: {
      name: 'Tela Hexagonal',
      sku: 'TH-001',
      material: 'Aco Inox',
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
      state: { products: fixtureProducts },
    });

    const screen = render(<ProductCatalog />);

    // Wait for the table to render
    await expect.element(screen.getByText('TS-5050')).toBeVisible();
    await expect.element(screen.getByText('Tela Soldada 50x50')).toBeVisible();
    await expect.element(screen.getByText('Aco Galvanizado')).toBeVisible();
    await expect.element(screen.getByText('TH-001')).toBeVisible();
    await expect.element(screen.getByText('Tela Hexagonal')).toBeVisible();

    // Column headers
    await expect.element(screen.getByText('SKU')).toBeVisible();
    await expect.element(screen.getByText('Nome')).toBeVisible();
    await expect.element(screen.getByText('Material')).toBeVisible();
  });

  test('shows empty state when no products', async () => {
    await commands.setFixtureState({
      state: { products: [] },
    });

    const screen = render(<ProductCatalog />);

    await expect.element(screen.getByText(/Nenhum produto cadastrado/)).toBeVisible();
  });

  test('opens add modal and submits product', async () => {
    await commands.setFixtureState({
      state: { products: [] },
    });

    const screen = render(<ProductCatalog />);

    // Wait for empty state, then click add
    await expect.element(screen.getByText(/Nenhum produto cadastrado/)).toBeVisible();

    await screen.getByRole('button', { name: 'Adicionar Produto' }).click();

    // Modal should open - verify form fields are present
    await expect.element(screen.getByPlaceholder('Nome do produto')).toBeVisible();

    // Fill in the form
    const nameInput = screen.getByPlaceholder('Nome do produto');
    await nameInput.fill('Novo Produto');

    const skuInput = screen.getByPlaceholder('Codigo SKU');
    await skuInput.fill('NP-001');

    const materialInput = screen.getByPlaceholder('Tipo de material');
    await materialInput.fill('Aco');

    // Fill numeric fields using label text via page locators
    await screen.getByLabelText('Largura (pol.)').fill('48');
    await screen.getByLabelText('Comprimento (pol.)').fill('96');
    await screen.getByLabelText('Custo por unidade (R$)').fill('25.00');

    // Submit the form
    await screen.getByText('Salvar').click();

    // After save, the new product should appear in the table
    await expect.element(page.getByText('NP-001'), { timeout: 5000 }).toBeVisible();
    await expect.element(page.getByText('Novo Produto'), { timeout: 5000 }).toBeVisible();
  });

  test('shows validation errors for missing required fields', async () => {
    await commands.setFixtureState({
      state: { products: [] },
    });

    const screen = render(<ProductCatalog />);

    await expect.element(screen.getByText(/Nenhum produto cadastrado/)).toBeVisible();

    await screen.getByRole('button', { name: 'Adicionar Produto' }).click();

    // Submit without filling anything
    await screen.getByRole('button', { name: 'Salvar' }).click();

    // Should show validation errors
    await expect.element(screen.getByText('Nome e obrigatorio')).toBeVisible();
    await expect.element(screen.getByText('SKU e obrigatorio')).toBeVisible();
  });

  test('edit button opens modal pre-filled with product data', async () => {
    await commands.setFixtureState({
      state: { products: [fixtureProducts[0]] },
    });

    const screen = render(<ProductCatalog />);

    // Wait for table to render
    await expect.element(screen.getByText('TS-5050')).toBeVisible();

    // Click edit button
    await screen.getByTitle('Editar').click();

    // Modal should open with "Editar Produto" title
    await expect.element(screen.getByText('Editar Produto')).toBeVisible();

    // Fields should be pre-filled
    const nameInput = screen.getByPlaceholder('Nome do produto');
    await expect.element(nameInput).toHaveValue('Tela Soldada 50x50');

    const skuInput = screen.getByPlaceholder('Codigo SKU');
    await expect.element(skuInput).toHaveValue('TS-5050');
  });
});
