import { test, expect, describe } from 'vitest';
import { validateForm } from '../../src/components/ProductCatalog';

const validForm = {
  name: 'Tela Soldada',
  sku: 'TS-001',
  material: 'Aco Galvanizado',
  width_inches: '48',
  length_inches: '96',
  weight_per_sqft: '1.5',
  cost_per_each: '25.00',
  cost_per_linft: '',
  cost_per_sqft: '',
  primary_cost_basis: 'each' as const,
  margin_target: '25',
  margin_floor: '15',
};

describe('validateForm', () => {
  test('returns no errors for valid form', () => {
    expect(validateForm(validForm)).toEqual([]);
  });

  test('requires name', () => {
    const errors = validateForm({ ...validForm, name: '' });
    expect(errors).toContain('Nome e obrigatorio');
  });

  test('requires sku', () => {
    const errors = validateForm({ ...validForm, sku: '  ' });
    expect(errors).toContain('SKU e obrigatorio');
  });

  test('requires positive width', () => {
    const errors = validateForm({ ...validForm, width_inches: '0' });
    expect(errors).toContain('Largura deve ser maior que 0');
  });

  test('requires positive length', () => {
    const errors = validateForm({ ...validForm, length_inches: '' });
    expect(errors).toContain('Comprimento deve ser maior que 0');
  });

  test('requires cost field matching cost basis - each', () => {
    const errors = validateForm({
      ...validForm,
      primary_cost_basis: 'each',
      cost_per_each: '',
    });
    expect(errors).toContain('Custo por unidade e obrigatorio quando a base de custo e unidade');
  });

  test('requires cost field matching cost basis - linear_foot', () => {
    const errors = validateForm({
      ...validForm,
      primary_cost_basis: 'linear_foot',
      cost_per_linft: '',
    });
    expect(errors).toContain(
      'Custo por pe linear e obrigatorio quando a base de custo e pe linear',
    );
  });

  test('requires cost field matching cost basis - square_foot', () => {
    const errors = validateForm({
      ...validForm,
      primary_cost_basis: 'square_foot',
      cost_per_sqft: '',
    });
    expect(errors).toContain(
      'Custo por pe quadrado e obrigatorio quando a base de custo e pe quadrado',
    );
  });

  test('margin target must be greater than margin floor', () => {
    const errors = validateForm({
      ...validForm,
      margin_target: '15',
      margin_floor: '15',
    });
    expect(errors).toContain('Margem alvo deve ser maior que margem minima');
  });

  test('margin floor must be non-negative', () => {
    const errors = validateForm({
      ...validForm,
      margin_floor: '-1',
    });
    expect(errors).toContain('Margem minima deve ser >= 0');
  });

  test('collects multiple errors at once', () => {
    const errors = validateForm({
      ...validForm,
      name: '',
      sku: '',
      width_inches: '0',
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
