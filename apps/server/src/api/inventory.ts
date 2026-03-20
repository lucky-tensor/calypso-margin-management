import { sql } from 'db';
import type { ProductProperties } from 'core';
import { computeStockPosition } from 'core';
import { getAuthenticatedUser, getCorsHeaders, requireRole } from './auth';

const STATUS_LABELS: Record<string, string> = {
  healthy: 'In Stock',
  warning: 'Low Stock',
  critical: 'Out of Stock',
};

export async function handleInventoryRequest(req: Request, url: URL): Promise<Response | null> {
  const corsHeaders = getCorsHeaders(req);

  if (!url.pathname.startsWith('/api/inventory')) return null;

  // GET /api/inventory/:productId — full stock position (requires inventory_manager or admin)
  const productIdMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
  if (req.method === 'GET' && productIdMatch) {
    const productId = productIdMatch[1];

    // Role check: inventory_manager or admin only
    const roleError = await requireRole('inventory_manager', 'admin')(req);
    if (roleError) return roleError;

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
