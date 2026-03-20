import { sql } from 'db';
import type {
  ProductProperties,
  InventoryTxnProperties,
  InventoryTxnType,
  StockPosition,
} from 'core';
import { computeStockPosition } from 'core';
import { getAuthenticatedUser, getCorsHeaders, requireRole } from './auth';

const STATUS_LABELS: Record<string, string> = {
  healthy: 'In Stock',
  warning: 'Low Stock',
  critical: 'Out of Stock',
};

const MANUAL_TXN_TYPES: InventoryTxnType[] = ['receipt', 'adjustment', 'return'];

export interface InventoryEntry {
  product_id: string;
  product_sku: string;
  product_name: string;
  position: StockPosition;
}

export async function handleInventoryRequest(req: Request, url: URL): Promise<Response | null> {
  const corsHeaders = getCorsHeaders(req);

  if (!url.pathname.startsWith('/api/inventory')) return null;

  // GET /api/inventory — stock positions for all products (requires inventory_manager or admin)
  if (req.method === 'GET' && url.pathname === '/api/inventory') {
    // Role check: requires inventory_manager or admin
    const roleCheck = await requireRole('inventory_manager', 'admin')(req);
    if (roleCheck) return roleCheck;

    try {
      // Fetch all products in a single query
      const productRows = await sql<
        { id: string; properties: ProductProperties; created_at: string }[]
      >`
        SELECT id, properties, created_at
        FROM entities
        WHERE type = 'product'
        ORDER BY created_at ASC
      `;

      if (productRows.length === 0) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Collect product IDs for order aggregate query
      const productIds = productRows.map(
        (r: { id: string; properties: ProductProperties; created_at: string }) => r.id,
      );

      // Fetch order aggregates in a single batched query
      // Sum qty_eaches grouped by product_id and status
      // Only consider non-cancelled, non-shipped orders
      const orderAggRows = await sql<
        { product_id: string; status: string; total_qty_eaches: number }[]
      >`
        SELECT
          properties->>'product_id' AS product_id,
          properties->>'status' AS status,
          COALESCE(SUM((properties->>'qty_eaches')::numeric), 0)::int AS total_qty_eaches
        FROM entities
        WHERE type = 'order'
          AND properties->>'product_id' = ANY(${productIds})
          AND properties->>'status' NOT IN ('cancelled', 'shipped')
        GROUP BY properties->>'product_id', properties->>'status'
      `;

      // Build aggregate maps: product_id -> { confirmed: number, draft: number }
      const confirmedMap = new Map<string, number>();
      const draftMap = new Map<string, number>();

      for (const row of orderAggRows) {
        if (row.status === 'confirmed') {
          confirmedMap.set(
            row.product_id,
            (confirmedMap.get(row.product_id) ?? 0) + Number(row.total_qty_eaches),
          );
        } else if (row.status === 'draft') {
          draftMap.set(
            row.product_id,
            (draftMap.get(row.product_id) ?? 0) + Number(row.total_qty_eaches),
          );
        }
      }

      // Compute stock position for each product in a single pass
      const result: InventoryEntry[] = productRows.map(
        (row: { id: string; properties: ProductProperties; created_at: string }) => {
          const props = row.properties;
          const confirmedQty = confirmedMap.get(row.id) ?? 0;
          const draftQty = draftMap.get(row.id) ?? 0;

          const inventoryInput = {
            qty_on_hand: props.qty_on_hand_eaches ?? 0,
            reorder_point: props.reorder_point_eaches ?? 0,
            safety_stock: props.safety_stock_eaches ?? 0,
            reorder_qty: props.reorder_qty_eaches ?? 0,
            lead_time_days: props.lead_time_days ?? 0,
            pending_order_weight: props.pending_order_weight ?? 0.7,
            avg_daily_usage: 0,
          };

          const position = computeStockPosition(inventoryInput, confirmedQty, draftQty);

          return {
            product_id: row.id,
            product_sku: props.sku,
            product_name: props.name,
            position,
          };
        },
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('GET /api/inventory ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // POST /api/inventory/:productId/adjust
  const adjustMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/adjust$/);
  if (req.method === 'POST' && adjustMatch) {
    const productId = adjustMatch[1];

    // Check role: inventory_manager or admin only
    const guard = requireRole('inventory_manager', 'admin');
    const guardResponse = await guard(req);
    if (guardResponse) return guardResponse;

    try {
      const body = await req.json();
      const { txn_type, qty_eaches, reference } = body;

      // Validate txn_type
      if (!txn_type || !MANUAL_TXN_TYPES.includes(txn_type as InventoryTxnType)) {
        return new Response(
          JSON.stringify({
            error: `txn_type must be one of: ${MANUAL_TXN_TYPES.join(', ')}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Validate qty_eaches
      if (qty_eaches === undefined || qty_eaches === null || typeof qty_eaches !== 'number') {
        return new Response(
          JSON.stringify({ error: 'qty_eaches is required and must be a number' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Validate reference
      if (!reference || typeof reference !== 'string') {
        return new Response(JSON.stringify({ error: 'reference is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch the product
      const productRows = await sql<
        { id: string; properties: ProductProperties; created_at: string }[]
      >`
        SELECT id, properties, created_at
        FROM entities
        WHERE id = ${productId} AND type = 'product'
      `;

      if (productRows.length === 0) {
        return new Response(JSON.stringify({ error: 'Product not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const product = productRows[0];
      const currentQty = product.properties.qty_on_hand_eaches ?? 0;
      const balanceAfter = currentQty + qty_eaches;

      // Reject if balance would go below 0
      if (balanceAfter < 0) {
        return new Response(
          JSON.stringify({
            error: `Adjustment would result in negative stock. Current: ${currentQty}, Adjustment: ${qty_eaches}, Result: ${balanceAfter}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Get authenticated user for created_by (guaranteed non-null since requireRole passed)
      const user = await getAuthenticatedUser(req);

      const txnId = crypto.randomUUID();
      const txnProperties: InventoryTxnProperties = {
        product_id: productId,
        product_sku: product.properties.sku,
        txn_type: txn_type as InventoryTxnType,
        qty_eaches,
        reference,
        balance_after: balanceAfter,
        created_by: user!.id,
      };

      // Insert inventory_txn entity
      const txnRows = await sql<
        { id: string; properties: InventoryTxnProperties; created_at: string }[]
      >`
        INSERT INTO entities (id, type, properties, tenant_id)
        VALUES (${txnId}, 'inventory_txn', ${sql.json(JSON.parse(JSON.stringify(txnProperties)))}, null)
        RETURNING id, properties, created_at
      `;

      // Update product qty_on_hand_eaches
      const updatedProps: ProductProperties = {
        ...product.properties,
        qty_on_hand_eaches: balanceAfter,
      };

      await sql`
        UPDATE entities
        SET properties = ${sql.json(JSON.parse(JSON.stringify(updatedProps)))},
            updated_at = CURRENT_TIMESTAMP,
            version = version + 1
        WHERE id = ${productId} AND type = 'product'
      `;

      // Fetch updated product
      const updatedProductRows = await sql<
        { id: string; properties: ProductProperties; created_at: string }[]
      >`
        SELECT id, properties, created_at
        FROM entities
        WHERE id = ${productId} AND type = 'product'
      `;

      const txn = txnRows[0];
      return new Response(
        JSON.stringify({
          transaction: {
            id: txn.id,
            created_at: txn.created_at,
            properties: txn.properties,
          },
          stock_position: {
            product_id: productId,
            qty_on_hand_eaches: balanceAfter,
            previous_qty: currentQty,
          },
          product: {
            id: updatedProductRows[0].id,
            created_at: updatedProductRows[0].created_at,
            properties: updatedProductRows[0].properties,
          },
        }),
        {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    } catch (err) {
      console.error('POST /api/inventory/:productId/adjust ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // GET /api/inventory/:productId — full stock position (requires inventory_manager or admin)
  const productIdMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
  if (req.method === 'GET' && productIdMatch) {
    const productId = productIdMatch[1];

    // Role check: inventory_manager or admin only
    const roleError = await requireRole('inventory_manager', 'admin')(req);
    if (roleError) return roleError;

    try {
      const productRows = await sql<
        { id: string; properties: ProductProperties; created_at: string }[]
      >`
        SELECT id, properties, created_at
        FROM entities
        WHERE id = ${productId} AND type = 'product'
      `;

      if (productRows.length === 0) {
        return new Response(JSON.stringify({ error: 'Product not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const props = productRows[0].properties;

      // Sum committed qty_eaches: confirmed and shipped orders for this product
      const confirmedRows = await sql<{ total: string }[]>`
        SELECT COALESCE(SUM((properties->>'qty_eaches')::numeric), 0) AS total
        FROM entities
        WHERE type = 'order'
          AND properties->>'product_id' = ${productId}
          AND properties->>'status' IN ('confirmed', 'shipped')
      `;
      const confirmedQty = Number(confirmedRows[0].total);

      // Sum draft qty_eaches: draft orders for this product
      const draftRows = await sql<{ total: string }[]>`
        SELECT COALESCE(SUM((properties->>'qty_eaches')::numeric), 0) AS total
        FROM entities
        WHERE type = 'order'
          AND properties->>'product_id' = ${productId}
          AND properties->>'status' = 'draft'
      `;
      const draftQty = Number(draftRows[0].total);

      // Compute trailing 30-day confirmed order average for days_of_stock
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const trailingRows = await sql<{ total: string }[]>`
        SELECT COALESCE(SUM((properties->>'qty_eaches')::numeric), 0) AS total
        FROM entities
        WHERE type = 'order'
          AND properties->>'product_id' = ${productId}
          AND properties->>'status' IN ('confirmed', 'shipped')
          AND created_at >= ${thirtyDaysAgo}
      `;
      const trailing30DayQty = Number(trailingRows[0].total);
      const avgDailyUsage = trailing30DayQty / 30;

      const inventoryInput = {
        qty_on_hand: props.qty_on_hand_eaches,
        reorder_point: props.reorder_point_eaches,
        safety_stock: props.safety_stock_eaches,
        reorder_qty: props.reorder_qty_eaches ?? 0,
        lead_time_days: props.lead_time_days ?? 0,
        pending_order_weight: props.pending_order_weight,
        avg_daily_usage: avgDailyUsage,
      };

      const position = computeStockPosition(inventoryInput, confirmedQty, draftQty);

      return new Response(JSON.stringify(position), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('GET /api/inventory/:productId ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // GET /api/inventory/:productId/transactions
  const transactionsMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/transactions$/);
  if (req.method === 'GET' && transactionsMatch) {
    const productId = transactionsMatch[1];

    // Requires inventory_manager or admin role
    const roleGuard = requireRole('inventory_manager', 'admin');
    const guardResponse = await roleGuard(req);
    if (guardResponse) return guardResponse;

    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const limit = limitParam !== null ? parseInt(limitParam, 10) : null;
    const offset = offsetParam !== null ? parseInt(offsetParam, 10) : 0;

    try {
      let rows: { id: string; properties: InventoryTxnProperties; created_at: string }[];

      if (limit !== null) {
        rows = await sql<{ id: string; properties: InventoryTxnProperties; created_at: string }[]>`
          SELECT id, properties, created_at
          FROM entities
          WHERE type = 'inventory_txn'
            AND properties->>'product_id' = ${productId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        rows = await sql<{ id: string; properties: InventoryTxnProperties; created_at: string }[]>`
          SELECT id, properties, created_at
          FROM entities
          WHERE type = 'inventory_txn'
            AND properties->>'product_id' = ${productId}
          ORDER BY created_at DESC
          OFFSET ${offset}
        `;
      }

      const transactions = rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        ...row.properties,
      }));

      return new Response(JSON.stringify({ transactions }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('GET /api/inventory/:productId/transactions ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // GET /api/inventory/:productId/availability
  const availabilityMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/availability$/);
  if (req.method === 'GET' && availabilityMatch) {
    const productId = availabilityMatch[1];
    try {
      // Fetch the product
      const productRows = await sql<
        { id: string; properties: ProductProperties; created_at: string }[]
      >`
        SELECT id, properties, created_at
        FROM entities
        WHERE id = ${productId} AND type = 'product'
      `;

      if (productRows.length === 0) {
        return new Response(JSON.stringify({ error: 'Product not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const props = productRows[0].properties;

      // Sum committed qty_eaches: confirmed and shipped orders for this product
      const confirmedRows = await sql<{ total: string }[]>`
        SELECT COALESCE(SUM((properties->>'qty_eaches')::numeric), 0) AS total
        FROM entities
        WHERE type = 'order'
          AND properties->>'product_id' = ${productId}
          AND properties->>'status' IN ('confirmed', 'shipped')
      `;
      const confirmedQty = Number(confirmedRows[0].total);

      // Sum draft qty_eaches: draft orders for this product
      const draftRows = await sql<{ total: string }[]>`
        SELECT COALESCE(SUM((properties->>'qty_eaches')::numeric), 0) AS total
        FROM entities
        WHERE type = 'order'
          AND properties->>'product_id' = ${productId}
          AND properties->>'status' = 'draft'
      `;
      const draftQty = Number(draftRows[0].total);

      const inventoryInput = {
        qty_on_hand: props.qty_on_hand_eaches,
        reorder_point: props.reorder_point_eaches,
        safety_stock: props.safety_stock_eaches,
        reorder_qty: props.reorder_qty_eaches ?? 0,
        lead_time_days: props.lead_time_days ?? 0,
        pending_order_weight: props.pending_order_weight,
        avg_daily_usage: 0,
      };

      const position = computeStockPosition(inventoryInput, confirmedQty, draftQty);

      const status = position.status;
      const status_label = STATUS_LABELS[status];
      const can_order = status !== 'critical';

      return new Response(
        JSON.stringify({
          product_id: productId,
          effective_available: position.effective_available,
          status,
          status_label,
          can_order,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    } catch (err) {
      console.error('GET /api/inventory/:productId/availability ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
