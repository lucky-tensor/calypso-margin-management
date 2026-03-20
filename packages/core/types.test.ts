import { describe, it, expectTypeOf } from 'vitest';
import type {
  Role,
  UserProperties,
  UnitOfMeasure,
  CostBasis,
  OrderStatus,
  ProductProperties,
  OrderProperties,
  UnitConversions,
  MarginResult,
  Product,
  Order,
  InventoryTxnType,
  InventoryTxnProperties,
  EntityType,
} from './types';

describe('Role type', () => {
  it('Role accepts valid values', () => {
    const a: Role = 'sales_rep';
    const b: Role = 'inventory_manager';
    const c: Role = 'admin';
    expectTypeOf(a).toMatchTypeOf<Role>();
    expectTypeOf(b).toMatchTypeOf<Role>();
    expectTypeOf(c).toMatchTypeOf<Role>();
  });

  it('UserProperties includes role and display_name', () => {
    const user: UserProperties = {
      username: 'jsmith',
      password_hash: 'hash',
      role: 'sales_rep',
      display_name: 'John Smith',
    };
    expectTypeOf(user).toMatchTypeOf<UserProperties>();
    expectTypeOf(user.role).toMatchTypeOf<Role>();
    expectTypeOf(user.display_name).toMatchTypeOf<string>();
  });
});

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
    };
    expectTypeOf(product).toMatchTypeOf<ProductProperties>();
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

  it('EntityType includes inventory_txn', () => {
    const txn: EntityType = 'inventory_txn';
    expectTypeOf(txn).toMatchTypeOf<EntityType>();
  });

  it('InventoryTxnType covers all five variants', () => {
    const a: InventoryTxnType = 'initial';
    const b: InventoryTxnType = 'receipt';
    const c: InventoryTxnType = 'adjustment';
    const d: InventoryTxnType = 'shipment';
    const e: InventoryTxnType = 'return';
    expectTypeOf(a).toMatchTypeOf<InventoryTxnType>();
    expectTypeOf(b).toMatchTypeOf<InventoryTxnType>();
    expectTypeOf(c).toMatchTypeOf<InventoryTxnType>();
    expectTypeOf(d).toMatchTypeOf<InventoryTxnType>();
    expectTypeOf(e).toMatchTypeOf<InventoryTxnType>();
  });

  it('InventoryTxnProperties has all required fields', () => {
    const txn: InventoryTxnProperties = {
      product_id: 'prod-1',
      product_sku: 'WM-4x4-10GA',
      txn_type: 'receipt',
      qty_eaches: 100,
      reference: 'PO-2024-001',
      balance_after: 250,
      created_by: 'user-1',
    };
    expectTypeOf(txn).toMatchTypeOf<InventoryTxnProperties>();
  });
});
