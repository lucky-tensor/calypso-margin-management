import { sql } from 'db';
import type { Order, OrderProperties, ProductProperties, InventoryTxnProperties } from 'core';
import { computeOrderFields, checkOrderStock } from 'core';
import { getAuthenticatedUser, getCorsHeaders, requireRole } from './auth';

function rowToOrder(row: { id: string; properties: OrderProperties; created_at: string }): Order {
  return {
    id: row.id,
    created_at: row.created_at,
    properties: row.properties,
  };
}

export async function handleOrdersRequest(req: Request, url: URL): Promise<Response | null> {
  const corsHeaders = getCorsHeaders(req);

  if (!url.pathname.startsWith('/api/orders')) return null;

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // GET /api/orders
  if (req.method === 'GET' && url.pathname === '/api/orders') {
    try {
      const statusFilter = url.searchParams.get('status');
      const customerFilter = url.searchParams.get('customer');

      let rows: { id: string; properties: OrderProperties; created_at: string }[];

      if (statusFilter && customerFilter) {
        rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
          SELECT id, properties, created_at
          FROM entities
          WHERE type = 'order'
            AND properties->>'status' = ${statusFilter}
            AND LOWER(properties->>'customer') LIKE ${'%' + customerFilter.toLowerCase() + '%'}
          ORDER BY created_at DESC
        `;
      } else if (statusFilter) {
        rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
          SELECT id, properties, created_at
          FROM entities
          WHERE type = 'order'
            AND properties->>'status' = ${statusFilter}
          ORDER BY created_at DESC
        `;
      } else if (customerFilter) {
        rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
          SELECT id, properties, created_at
          FROM entities
          WHERE type = 'order'
            AND LOWER(properties->>'customer') LIKE ${'%' + customerFilter.toLowerCase() + '%'}
          ORDER BY created_at DESC
        `;
      } else {
        rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
          SELECT id, properties, created_at
          FROM entities
          WHERE type = 'order'
          ORDER BY created_at DESC
        `;
      }

      const orders: Order[] = rows.map(rowToOrder);
      return new Response(JSON.stringify(orders), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('GET /api/orders ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // POST /api/orders
  if (req.method === 'POST' && url.pathname === '/api/orders') {
    try {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const customer = body.customer as string | undefined;
      const product_id = body.product_id as string | undefined;
      const quantity = body.quantity as number | undefined;
      const unit_of_measure = body.unit_of_measure as string | undefined;
      const sell_price_per_unit = body.sell_price_per_unit as number | undefined;
      const notes = body.notes as string | undefined;

      if (!customer || customer.trim() === '') {
        return new Response(JSON.stringify({ error: 'Missing required field: customer' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!product_id) {
        return new Response(JSON.stringify({ error: 'Missing required field: product_id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (quantity === undefined) {
        return new Response(JSON.stringify({ error: 'Missing required field: quantity' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!unit_of_measure) {
        return new Response(JSON.stringify({ error: 'Missing required field: unit_of_measure' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const validUnits = ['each', 'linear_foot', 'square_foot'];
      if (!validUnits.includes(unit_of_measure)) {
        return new Response(
          JSON.stringify({ error: `Invalid unit_of_measure: ${unit_of_measure}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
      if (sell_price_per_unit === undefined) {
        return new Response(
          JSON.stringify({ error: 'Missing required field: sell_price_per_unit' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Fetch the product entity
      const productRows = await sql<
        { id: string; properties: ProductProperties; created_at: string }[]
      >`
        SELECT id, properties, created_at
        FROM entities
        WHERE id = ${product_id!} AND type = 'product'
      `;

      if (productRows.length === 0) {
        return new Response(JSON.stringify({ error: 'Product not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const product = {
        id: productRows[0].id,
        created_at: productRows[0].created_at,
        properties: productRows[0].properties,
      };

      // Compute all derived order fields
      const computed = computeOrderFields(
        product,
        quantity,
        unit_of_measure as 'each' | 'linear_foot' | 'square_foot',
        sell_price_per_unit,
      );

      // Reject orders below the product's margin floor
      if (computed.margin_percent < product.properties.margin_floor) {
        return new Response(
          JSON.stringify({
            error: `Margin below floor: ${computed.margin_percent.toFixed(2)}% < floor ${product.properties.margin_floor}%`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Aggregate committed (confirmed) and pending (draft) qty_eaches for this product
      const stockAggRows = await sql<{ committed_qty: string; pending_qty: string }[]>`
        SELECT
          COALESCE(SUM(CASE WHEN properties->>'status' = 'confirmed' THEN (properties->>'qty_eaches')::numeric ELSE 0 END), 0) AS committed_qty,
          COALESCE(SUM(CASE WHEN properties->>'status' = 'draft' THEN (properties->>'qty_eaches')::numeric ELSE 0 END), 0) AS pending_qty
        FROM entities
        WHERE type = 'order'
          AND properties->>'product_id' = ${product_id!}
          AND properties->>'status' IN ('confirmed', 'draft')
      `;

      const committedQty = Number(stockAggRows[0]?.committed_qty ?? 0);
      const pendingQty = Number(stockAggRows[0]?.pending_qty ?? 0);

      // Build inventory input for the stock engine
      const inventoryInput = {
        qty_on_hand: product.properties.qty_on_hand_eaches,
        reorder_point: product.properties.reorder_point_eaches,
        safety_stock: product.properties.safety_stock_eaches,
        reorder_qty: product.properties.reorder_qty_eaches ?? 0,
        lead_time_days: product.properties.lead_time_days ?? 0,
        pending_order_weight: product.properties.pending_order_weight,
        avg_daily_usage: 0,
      };

      const stockCheck = checkOrderStock(
        inventoryInput,
        committedQty,
        pendingQty,
        computed.qty_eaches,
      );

      if (!stockCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: stockCheck.block_reason ?? 'Order blocked: insufficient stock',
            stock_position: stockCheck.position,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const properties: OrderProperties = {
        customer: customer!,
        product_id: product_id!,
        product_name: product.properties.name,
        quantity: quantity!,
        unit_of_measure: unit_of_measure as 'each' | 'linear_foot' | 'square_foot',
        sell_price_per_unit: sell_price_per_unit!,
        qty_eaches: computed.qty_eaches,
        qty_linft: computed.qty_linft,
        qty_sqft: computed.qty_sqft,
        total_revenue: computed.total_revenue,
        total_cost: computed.total_cost,
        margin_dollars: computed.margin_dollars,
        margin_percent: computed.margin_percent,
        margin_target: product.properties.margin_target,
        margin_floor: product.properties.margin_floor,
        status: 'draft',
        notes: notes ?? '',
        stock_position_at_creation: stockCheck.position,
        stock_warning: stockCheck.warning,
        created_by: user.id,
        confirmed_by: null,
        confirmed_at: null,
        cancelled_by: null,
        cancelled_at: null,
        shipped_by: null,
        shipped_at: null,
      };

      const id = crypto.randomUUID();

      const rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
        INSERT INTO entities (id, type, properties, tenant_id)
        VALUES (${id}, 'order', ${sql.json(JSON.parse(JSON.stringify(properties)))}, null)
        RETURNING id, properties, created_at
      `;

      const order = rowToOrder(rows[0]);
      return new Response(JSON.stringify(order), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('POST /api/orders ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // PATCH /api/orders/:id
  const patchMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === 'PATCH' && patchMatch) {
    const orderId = patchMatch[1];
    try {
      const existing = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
        SELECT id, properties, created_at
        FROM entities
        WHERE id = ${orderId} AND type = 'order'
      `;

      if (existing.length === 0) {
        return new Response(JSON.stringify({ error: 'Order not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const currentProps = existing[0].properties;
      const currentStatus = currentProps.status;
      const newStatus = body.status as string | undefined;

      // Validate status transition if status is being changed
      if (newStatus !== undefined && newStatus !== currentStatus) {
        const validTransitions: Record<string, string[]> = {
          draft: ['confirmed', 'cancelled'],
          confirmed: ['shipped', 'cancelled'],
          shipped: [],
          cancelled: [],
        };

        const allowed = validTransitions[currentStatus] ?? [];
        if (!allowed.includes(newStatus!)) {
          return new Response(
            JSON.stringify({
              error: `Invalid status transition: ${currentStatus} -> ${newStatus}`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Require inventory_manager or admin role for shipped transition
        if (newStatus === 'shipped') {
          const roleGuard = requireRole('inventory_manager', 'admin');
          const roleError = await roleGuard(req);
          if (roleError) return roleError;
        }
      }

      const updatedProps: OrderProperties = { ...currentProps };

      if (body.notes !== undefined) {
        updatedProps.notes = body.notes as string;
      }

      if (newStatus !== undefined && newStatus !== currentStatus) {
        updatedProps.status = newStatus as OrderProperties['status'];
        const now = new Date().toISOString();

        if (newStatus === 'confirmed') {
          updatedProps.confirmed_by = user.id;
          updatedProps.confirmed_at = now;
        } else if (newStatus === 'cancelled') {
          updatedProps.cancelled_by = user.id;
          updatedProps.cancelled_at = now;
        } else if (newStatus === 'shipped') {
          updatedProps.shipped_by = user.id;
          updatedProps.shipped_at = now;
        }
      }

      const rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
        UPDATE entities
        SET properties = ${sql.json(JSON.parse(JSON.stringify(updatedProps)))}, updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE id = ${orderId} AND type = 'order'
        RETURNING id, properties, created_at
      `;

      // If transitioning to shipped, create inventory_txn and decrement product qty
      if (newStatus === 'shipped' && newStatus !== currentStatus) {
        const order = rowToOrder(rows[0]);
        const qtyChange = -order.properties.qty_eaches;

        // Fetch the product to get current qty and sku
        const productRows = await sql<
          { id: string; properties: ProductProperties; created_at: string }[]
        >`
          SELECT id, properties, created_at
          FROM entities
          WHERE id = ${order.properties.product_id} AND type = 'product'
        `;

        if (productRows.length > 0) {
          const product = productRows[0];
          const newQtyOnHand = (product.properties.qty_on_hand_eaches ?? 0) + qtyChange;
          const balanceAfter = newQtyOnHand;

          // Create shipment inventory_txn
          const txnId = crypto.randomUUID();
          const txnProperties: InventoryTxnProperties = {
            product_id: order.properties.product_id,
            product_sku: product.properties.sku,
            txn_type: 'shipment',
            qty_eaches: qtyChange,
            reference: order.id,
            balance_after: balanceAfter,
            created_by: user.id,
          };

          await sql`
            INSERT INTO entities (id, type, properties, tenant_id)
            VALUES (${txnId}, 'inventory_txn', ${sql.json(JSON.parse(JSON.stringify(txnProperties)))}, null)
          `;

          // Update product qty_on_hand_eaches
          const updatedProductProps: ProductProperties = {
            ...product.properties,
            qty_on_hand_eaches: newQtyOnHand,
          };

          await sql`
            UPDATE entities
            SET properties = ${sql.json(JSON.parse(JSON.stringify(updatedProductProps)))}, updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE id = ${order.properties.product_id} AND type = 'product'
          `;
        }

        return new Response(JSON.stringify(order), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const order = rowToOrder(rows[0]);
      return new Response(JSON.stringify(order), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('PATCH /api/orders/:id ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
