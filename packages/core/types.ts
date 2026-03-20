export type EntityType = 'user' | 'product' | 'order';

export interface Entity {
  id: string;
  type: EntityType;
  properties: Record<string, unknown>;
  tenant_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Relation {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface UserProperties {
  username: string;
  password_hash: string;
}

// --- Domain types ---

export type UnitOfMeasure = 'each' | 'linear_foot' | 'square_foot';

export type CostBasis = 'each' | 'linear_foot' | 'square_foot';

export type OrderStatus = 'draft' | 'confirmed' | 'cancelled';

export interface ProductProperties {
  name: string;
  sku: string;
  material: string;
  width_inches: number;
  length_inches: number;
  weight_per_sqft: number;
  cost_per_each: number | null;
  cost_per_linft: number | null;
  cost_per_sqft: number | null;
  primary_cost_basis: CostBasis;
  margin_target: number;
  margin_floor: number;
  qty_on_hand_eaches: number;
  safety_stock_eaches: number;
  reorder_point_eaches: number;
  reorder_qty_eaches: number | null;
  lead_time_days: number | null;
  pending_order_weight: number;
}

export interface OrderProperties {
  customer: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_of_measure: UnitOfMeasure;
  sell_price_per_unit: number;

  // Computed at creation time (authoritative, frozen on confirm)
  qty_eaches: number;
  qty_linft: number;
  qty_sqft: number;
  total_revenue: number;
  total_cost: number;
  margin_dollars: number;
  margin_percent: number;

  // Margin thresholds snapshot (from product at order creation time)
  margin_target: number;
  margin_floor: number;

  status: OrderStatus;
  notes: string;

  // Audit fields
  created_by: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
}

export interface UnitConversions {
  eaches: number;
  linear_feet: number;
  square_feet: number;
}

export interface MarginResult {
  dollars: number;
  percent: number;
}

export type Product = Pick<Entity, 'id' | 'created_at'> & {
  properties: ProductProperties;
};

export type Order = Pick<Entity, 'id' | 'created_at'> & {
  properties: OrderProperties;
};
