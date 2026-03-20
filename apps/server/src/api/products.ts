import { sql } from 'db';
import type { Product, ProductProperties, CostBasis } from 'core';
import { getAuthenticatedUser, getCorsHeaders } from './auth';

function validateProductProperties(
  props: Partial<ProductProperties>,
  isCreate: boolean,
): string | null {
  if (isCreate) {
    if (!props.name) return 'Missing required field: name';
    if (!props.sku) return 'Missing required field: sku';
    if (props.width_inches === undefined || props.width_inches === null)
      return 'Missing required field: width_inches';
    if (props.length_inches === undefined || props.length_inches === null)
      return 'Missing required field: length_inches';
    if (!props.primary_cost_basis) return 'Missing required field: primary_cost_basis';
  }

  if (props.width_inches !== undefined && props.width_inches !== null && props.width_inches <= 0) {
    return 'width_inches must be > 0';
  }
  if (
    props.length_inches !== undefined &&
    props.length_inches !== null &&
    props.length_inches <= 0
  ) {
    return 'length_inches must be > 0';
  }

  const marginTarget = props.margin_target;
  const marginFloor = props.margin_floor;
  if (marginFloor !== undefined && marginFloor !== null && marginFloor < 0) {
    return 'margin_floor must be >= 0';
  }
  if (
    marginTarget !== undefined &&
    marginTarget !== null &&
    marginFloor !== undefined &&
    marginFloor !== null
  ) {
    if (marginTarget <= marginFloor) {
      return 'margin_target must be > margin_floor';
    }
  }

  // Validate inventory fields
  if (props.safety_stock_eaches !== undefined && props.safety_stock_eaches !== null) {
    if (props.safety_stock_eaches < 0) return 'safety_stock_eaches must be >= 0';
  }
  if (props.reorder_point_eaches !== undefined && props.reorder_point_eaches !== null) {
    const safetyStock = props.safety_stock_eaches ?? 0;
    if (props.reorder_point_eaches < safetyStock) {
      return 'reorder_point_eaches must be >= safety_stock_eaches';
    }
  }
  if (props.reorder_qty_eaches !== undefined && props.reorder_qty_eaches !== null) {
    if (props.reorder_qty_eaches <= 0) return 'reorder_qty_eaches must be > 0 when set';
  }
  if (props.lead_time_days !== undefined && props.lead_time_days !== null) {
    if (props.lead_time_days <= 0) return 'lead_time_days must be > 0 when set';
  }
  if (props.pending_order_weight !== undefined && props.pending_order_weight !== null) {
    if (props.pending_order_weight < 0 || props.pending_order_weight > 1) {
      return 'pending_order_weight must be between 0.0 and 1.0';
    }
  }

  // Validate cost field matching primary_cost_basis
  if (props.primary_cost_basis) {
    const basis: CostBasis = props.primary_cost_basis;
    if (basis === 'each' && (props.cost_per_each === null || props.cost_per_each === undefined)) {
      return 'cost_per_each must be non-null when primary_cost_basis is each';
    }
    if (
      basis === 'linear_foot' &&
      (props.cost_per_linft === null || props.cost_per_linft === undefined)
    ) {
      return 'cost_per_linft must be non-null when primary_cost_basis is linear_foot';
    }
    if (
      basis === 'square_foot' &&
      (props.cost_per_sqft === null || props.cost_per_sqft === undefined)
    ) {
      return 'cost_per_sqft must be non-null when primary_cost_basis is square_foot';
    }
  }

  return null;
}

function rowToProduct(row: {
  id: string;
  properties: ProductProperties;
  created_at: string;
}): Product {
  const props = row.properties as Partial<ProductProperties> &
    Pick<
      ProductProperties,
      | 'name'
      | 'sku'
      | 'material'
      | 'width_inches'
      | 'length_inches'
      | 'weight_per_sqft'
      | 'cost_per_each'
      | 'cost_per_linft'
      | 'cost_per_sqft'
      | 'primary_cost_basis'
      | 'margin_target'
      | 'margin_floor'
    >;
  return {
    id: row.id,
    created_at: row.created_at,
    properties: {
      ...props,
      qty_on_hand_eaches: props.qty_on_hand_eaches ?? 0,
      safety_stock_eaches: props.safety_stock_eaches ?? 0,
      reorder_point_eaches: props.reorder_point_eaches ?? 0,
      reorder_qty_eaches: props.reorder_qty_eaches ?? null,
      lead_time_days: props.lead_time_days ?? null,
      pending_order_weight: props.pending_order_weight ?? 0.7,
    },
  };
}

export async function handleProductsRequest(req: Request, url: URL): Promise<Response | null> {
  const corsHeaders = getCorsHeaders(req);

  if (!url.pathname.startsWith('/api/products')) return null;

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // GET /api/products
  if (req.method === 'GET' && url.pathname === '/api/products') {
    try {
      const rows = await sql<{ id: string; properties: ProductProperties; created_at: string }[]>`
        SELECT id, properties, created_at
        FROM entities
        WHERE type = 'product'
        ORDER BY created_at DESC
      `;
      const products: Product[] = rows.map(rowToProduct);
      return new Response(JSON.stringify(products), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('GET /api/products ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // POST /api/products
  if (req.method === 'POST' && url.pathname === '/api/products') {
    try {
      const body = await req.json();

      const partial: Partial<ProductProperties> = {
        name: body.name,
        sku: body.sku,
        material: body.material ?? '',
        width_inches: body.width_inches,
        length_inches: body.length_inches,
        weight_per_sqft: body.weight_per_sqft ?? 0,
        cost_per_each: body.cost_per_each ?? null,
        cost_per_linft: body.cost_per_linft ?? null,
        cost_per_sqft: body.cost_per_sqft ?? null,
        primary_cost_basis: body.primary_cost_basis,
        margin_target: body.margin_target ?? 25,
        margin_floor: body.margin_floor ?? 15,
        qty_on_hand_eaches: body.qty_on_hand_eaches ?? 0,
        safety_stock_eaches: body.safety_stock_eaches ?? 0,
        reorder_point_eaches: body.reorder_point_eaches ?? 0,
        reorder_qty_eaches: body.reorder_qty_eaches ?? null,
        lead_time_days: body.lead_time_days ?? null,
        pending_order_weight: body.pending_order_weight ?? 0.7,
      };

      const validationError = validateProductProperties(partial, true);
      if (validationError) {
        return new Response(JSON.stringify({ error: validationError }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const properties: ProductProperties = partial as ProductProperties;
      const id = crypto.randomUUID();

      const rows = await sql<{ id: string; properties: ProductProperties; created_at: string }[]>`
        INSERT INTO entities (id, type, properties, tenant_id)
        VALUES (${id}, 'product', ${sql.json(JSON.parse(JSON.stringify(properties)))}, null)
        RETURNING id, properties, created_at
      `;

      const product = rowToProduct(rows[0]);
      return new Response(JSON.stringify(product), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('POST /api/products ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // PATCH /api/products/:id
  const patchMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (req.method === 'PATCH' && patchMatch) {
    const productId = patchMatch[1];
    try {
      const existing = await sql<
        { id: string; properties: ProductProperties; created_at: string }[]
      >`
        SELECT id, properties, created_at
        FROM entities
        WHERE id = ${productId} AND type = 'product'
      `;

      if (existing.length === 0) {
        return new Response(JSON.stringify({ error: 'Product not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const merged: ProductProperties = { ...existing[0].properties, ...body };

      const validationError = validateProductProperties(merged, false);
      if (validationError) {
        return new Response(JSON.stringify({ error: validationError }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rows = await sql<{ id: string; properties: ProductProperties; created_at: string }[]>`
        UPDATE entities
        SET properties = ${sql.json(JSON.parse(JSON.stringify(merged)))}, updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE id = ${productId} AND type = 'product'
        RETURNING id, properties, created_at
      `;

      const product = rowToProduct(rows[0]);
      return new Response(JSON.stringify(product), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('PATCH /api/products/:id ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
