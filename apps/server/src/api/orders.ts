import { sql } from 'db';
import type { Order, OrderProperties, ProductProperties } from 'core';
import { computeOrderFields } from 'core';
import { getAuthenticatedUser, getCorsHeaders } from './auth';

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
      const body = await req.json();

      const { customer, product_id, quantity, unit_of_measure, sell_price_per_unit, notes } = body;

      if (!customer) {
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
      if (quantity === undefined || quantity === null) {
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
      if (sell_price_per_unit === undefined || sell_price_per_unit === null) {
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
        WHERE id = ${product_id} AND type = 'product'
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
      const computed = computeOrderFields(product, quantity, unit_of_measure, sell_price_per_unit);

      const properties: OrderProperties = {
        customer,
        product_id,
        product_name: product.properties.name,
        quantity,
        unit_of_measure,
        sell_price_per_unit,
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
        created_by: user.id,
        confirmed_by: null,
        confirmed_at: null,
        cancelled_by: null,
        cancelled_at: null,
      };

      const id = crypto.randomUUID();

      const rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
        INSERT INTO entities (id, type, properties, tenant_id)
        VALUES (${id}, 'order', ${sql.json(properties)}, null)
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

      const body = await req.json();
      const currentProps = existing[0].properties;
      const currentStatus = currentProps.status;
      const newStatus = body.status;

      // Validate status transition if status is being changed
      if (newStatus !== undefined && newStatus !== currentStatus) {
        const validTransitions: Record<string, string[]> = {
          draft: ['confirmed', 'cancelled'],
          confirmed: ['cancelled'],
          cancelled: [],
        };

        const allowed = validTransitions[currentStatus] ?? [];
        if (!allowed.includes(newStatus)) {
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
      }

      const updatedProps: OrderProperties = { ...currentProps };

      if (body.notes !== undefined) {
        updatedProps.notes = body.notes;
      }

      if (newStatus !== undefined && newStatus !== currentStatus) {
        updatedProps.status = newStatus;
        const now = new Date().toISOString();

        if (newStatus === 'confirmed') {
          updatedProps.confirmed_by = user.id;
          updatedProps.confirmed_at = now;
        } else if (newStatus === 'cancelled') {
          updatedProps.cancelled_by = user.id;
          updatedProps.cancelled_at = now;
        }
      }

      const rows = await sql<{ id: string; properties: OrderProperties; created_at: string }[]>`
        UPDATE entities
        SET properties = ${sql.json(updatedProps)}, updated_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE id = ${orderId} AND type = 'order'
        RETURNING id, properties, created_at
      `;

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
