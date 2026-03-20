import { test, expect, describe } from 'vitest';
import { validateForm } from '../../src/components/ProductCatalog';

const validForm = {
  name: 'Welded Wire',
  sku: 'TS-001',
  material: 'Galvanized Steel',
  width_inches: '48',
  length_inches: '96',
  weight_per_sqft: '1.5',
  cost_per_each: '25.00',
  cost_per_linft: '',
  cost_per_sqft: '',
  primary_cost_basis: 'each' as const,
  margin_target: '25',
  margin_floor: '15',
  safety_stock_eaches: '10',
  reorder_point_eaches: '30',
  reorder_qty_eaches: '',
  lead_time_days: '',
  pending_order_weight: '0.7',
};

describe('validateForm', () => {
  test('returns no errors for valid form', () => {
    expect(validateForm(validForm)).toEqual([]);
  });

  test('requires name', () => {
    const errors = validateForm({ ...validForm, name: '' });
    expect(errors).toContain('Name is required');
  });

  test('requires sku', () => {
    const errors = validateForm({ ...validForm, sku: '  ' });
    expect(errors).toContain('SKU is required');
  });

  test('requires positive width', () => {
    const errors = validateForm({ ...validForm, width_inches: '0' });
    expect(errors).toContain('Width must be greater than 0');
  });

  test('requires positive length', () => {
    const errors = validateForm({ ...validForm, length_inches: '' });
    expect(errors).toContain('Length must be greater than 0');
  });

  test('requires cost field matching cost basis - each', () => {
    const errors = validateForm({
      ...validForm,
      primary_cost_basis: 'each',
      cost_per_each: '',
    });
    expect(errors).toContain('Cost per each is required when cost basis is each');
  });

  test('requires cost field matching cost basis - linear_foot', () => {
    const errors = validateForm({
      ...validForm,
      primary_cost_basis: 'linear_foot',
      cost_per_linft: '',
    });
    expect(errors).toContain('Cost per linear ft is required when cost basis is linear foot');
  });

  test('requires cost field matching cost basis - square_foot', () => {
    const errors = validateForm({
      ...validForm,
      primary_cost_basis: 'square_foot',
      cost_per_sqft: '',
    });
    expect(errors).toContain('Cost per square ft is required when cost basis is square foot');
  });

  test('margin target must be greater than margin floor', () => {
    const errors = validateForm({
      ...validForm,
      margin_target: '15',
      margin_floor: '15',
    });
    expect(errors).toContain('Margin target must be greater than margin floor');
  });

  test('margin floor must be non-negative', () => {
    const errors = validateForm({
      ...validForm,
      margin_floor: '-1',
    });
    expect(errors).toContain('Margin floor must be >= 0');
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
