import { describe, it, expectTypeOf } from 'vitest';
import type {
  UnitOfMeasure,
  CostBasis,
  OrderStatus,
  ProductProperties,
  OrderProperties,
  UnitConversions,
  MarginResult,
  Product,
  Order,
} from './types';

describe('domain types', () => {
  it('UnitOfMeasure covers the three units', () => {
    const a: UnitOfMeasure = 'each';
    const b: UnitOfMeasure = 'linear_foot';
    const c: UnitOfMeasure = 'square_foot';
    expectTypeOf(a).toMatchTypeOf<UnitOfMeasure>();
    expectTypeOf(b).toMatchTypeOf<UnitOfMeasure>();
    expectTypeOf(c).toMatchTypeOf<UnitOfMeasure>();
  });

  it('CostBasis covers the three bases', () => {
    const a: CostBasis = 'each';
    const b: CostBasis = 'linear_foot';
    const c: CostBasis = 'square_foot';
    expectTypeOf(a).toMatchTypeOf<CostBasis>();
    expectTypeOf(b).toMatchTypeOf<CostBasis>();
    expectTypeOf(c).toMatchTypeOf<CostBasis>();
  });

  it('OrderStatus covers all three statuses', () => {
    const a: OrderStatus = 'draft';
    const b: OrderStatus = 'confirmed';
    const c: OrderStatus = 'cancelled';
    expectTypeOf(a).toMatchTypeOf<OrderStatus>();
    expectTypeOf(b).toMatchTypeOf<OrderStatus>();
    expectTypeOf(c).toMatchTypeOf<OrderStatus>();
  });

  it('ProductProperties has all required fields', () => {
    const product: ProductProperties = {
      name: '4x4 Welded Wire Mesh - 10ga',
      sku: 'WM-4x4-10GA',
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
      pending_order_weight: 0.70,
    };
    expectTypeOf(product).toMatchTypeOf<ProductProperties>();
  });

  it('ProductProperties includes inventory fields with correct types', () => {
    expectTypeOf<ProductProperties>().toHaveProperty('qty_on_hand_eaches');
    expectTypeOf<ProductProperties>().toHaveProperty('safety_stock_eaches');
    expectTypeOf<ProductProperties>().toHaveProperty('reorder_point_eaches');
    expectTypeOf<ProductProperties>().toHaveProperty('reorder_qty_eaches');
    expectTypeOf<ProductProperties>().toHaveProperty('lead_time_days');
    expectTypeOf<ProductProperties>().toHaveProperty('pending_order_weight');
    expectTypeOf<ProductProperties['reorder_qty_eaches']>().toMatchTypeOf<number | null>();
    expectTypeOf<ProductProperties['lead_time_days']>().toMatchTypeOf<number | null>();
  });

  it('OrderProperties has all required fields including audit and snapshot', () => {
    const order: OrderProperties = {
      customer: 'Acme Fencing Co',
      product_id: 'prod-1',
      product_name: '4x4 Welded Wire Mesh - 10ga',
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
      qty_eaches: 10,
      qty_linft: 100,
      qty_sqft: 400,
      total_revenue: 450.0,
      total_cost: 320.0,
      margin_dollars: 130.0,
      margin_percent: 28.9,
      margin_target: 25,
      margin_floor: 15,
      status: 'draft',
      notes: '',
      created_by: 'user-1',
      confirmed_by: null,
      confirmed_at: null,
      cancelled_by: null,
      cancelled_at: null,
    };
    expectTypeOf(order).toMatchTypeOf<OrderProperties>();
  });

  it('UnitConversions has eaches, linear_feet, square_feet', () => {
    const conversions: UnitConversions = {
      eaches: 10,
      linear_feet: 100,
      square_feet: 400,
    };
    expectTypeOf(conversions).toMatchTypeOf<UnitConversions>();
  });

  it('MarginResult has dollars and percent', () => {
    const margin: MarginResult = { dollars: 130, percent: 28.9 };
    expectTypeOf(margin).toMatchTypeOf<MarginResult>();
  });

  it('Product view-model has id and created_at', () => {
    expectTypeOf<Product>().toHaveProperty('id');
    expectTypeOf<Product>().toHaveProperty('created_at');
    expectTypeOf<Product>().toHaveProperty('properties');
  });

  it('Order view-model has id and created_at', () => {
    expectTypeOf<Order>().toHaveProperty('id');
    expectTypeOf<Order>().toHaveProperty('created_at');
    expectTypeOf<Order>().toHaveProperty('properties');
  });
});
