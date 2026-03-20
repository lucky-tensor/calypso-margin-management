import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { Product, ProductProperties, Order, OrderProperties } from 'core';

export interface InventoryEntry {
  product_id: string;
  product_sku: string;
  product_name: string;
  position: {
    qty_on_hand: number;
    committed_qty: number;
    pending_qty: number;
    net_available: number;
    effective_available: number;
    status: 'healthy' | 'warning' | 'critical';
    reorder_point: number;
    safety_stock: number;
    reorder_qty: number;
    lead_time_days: number;
    days_of_stock: number | null;
  };
}

type UserRole = 'sales_rep' | 'inventory_manager' | 'admin';

interface UserSummary {
  id: string;
  username: string;
  role: UserRole;
  display_name: string;
}

type FixtureState = {
  products?: Product[];
  orders?: Order[];
  users?: UserSummary[];
  inventoryEntries?: InventoryEntry[];
  currentRole?: UserRole;
  [key: string]: unknown;
};
type FixtureStore = Record<string, FixtureState>;

function loadState(path: string): FixtureStore {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FixtureStore;
  } catch {
    return {};
  }
}

function saveState(path: string, store: FixtureStore): void {
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export async function handleFixtureRequest(req: Request, statePath: string): Promise<Response> {
  const url = new URL(req.url);
  const store = loadState(statePath);
  const fixtureId = url.searchParams.get('fixtureId') ?? 'default';
  const state: FixtureState = (store[fixtureId] as FixtureState) ?? {};

  // Fixture control endpoints
  if (url.pathname === '/fixture/state' && req.method === 'PUT') {
    const body = await req.json();
    store[body.fixtureId ?? 'default'] = body.state;
    saveState(statePath, store);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth stub - always authenticated
  if (url.pathname === '/api/auth/me') {
    const role =
      (state.currentRole as 'sales_rep' | 'inventory_manager' | 'admin') ??
      (url.searchParams.get('role') as 'sales_rep' | 'inventory_manager' | 'admin') ??
      'sales_rep';
    return new Response(
      JSON.stringify({
        user: { id: 'test-user', username: 'test', role, display_name: 'Test User' },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // GET /api/products
  if (url.pathname === '/api/products' && req.method === 'GET') {
    const products = state.products ?? [];
    return new Response(JSON.stringify(products), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/products
  if (url.pathname === '/api/products' && req.method === 'POST') {
    const body = await req.json();

    // Basic validation mirroring server
    if (!body.name) {
      return new Response(JSON.stringify({ error: 'Missing required field: name' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const products = state.products ?? [];
    const newProduct: Product = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      properties: {
        name: body.name,
        sku: body.sku ?? '',
        material: body.material ?? '',
        width_inches: body.width_inches ?? 0,
        length_inches: body.length_inches ?? 0,
        weight_per_sqft: body.weight_per_sqft ?? 0,
        cost_per_each: body.cost_per_each ?? null,
        cost_per_linft: body.cost_per_linft ?? null,
        cost_per_sqft: body.cost_per_sqft ?? null,
        primary_cost_basis: body.primary_cost_basis ?? 'each',
        margin_target: body.margin_target ?? 25,
        margin_floor: body.margin_floor ?? 15,
      } as ProductProperties,
    };

    products.push(newProduct);
    state.products = products;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(JSON.stringify(newProduct), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PATCH /api/products/:id
  const patchMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (patchMatch && req.method === 'PATCH') {
    const productId = patchMatch[1];
    const products = state.products ?? [];
    const index = products.findIndex((p) => p.id === productId);

    if (index === -1) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const existing = products[index];
    const merged: ProductProperties = { ...existing.properties, ...body };
    products[index] = { ...existing, properties: merged };
    state.products = products;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(JSON.stringify(products[index]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/orders
  if (url.pathname === '/api/orders' && req.method === 'GET') {
    let orders = state.orders ?? [];
    const statusParam = url.searchParams.get('status');
    const customerParam = url.searchParams.get('customer');
    if (statusParam) {
      orders = orders.filter((o) => o.properties.status === statusParam);
    }
    if (customerParam) {
      const needle = customerParam.toLowerCase();
      orders = orders.filter((o) => o.properties.customer.toLowerCase().includes(needle));
    }
    return new Response(JSON.stringify(orders), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/orders
  if (url.pathname === '/api/orders' && req.method === 'POST') {
    const body = await req.json();

    if (!body.customer) {
      return new Response(JSON.stringify({ error: 'Missing required field: customer' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!body.product_id) {
      return new Response(JSON.stringify({ error: 'Missing required field: product_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const products = state.products ?? [];
    const product = products.find((p) => p.id === body.product_id);
    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { computeOrderFields } = await import('core');
    const qty: number = body.quantity ?? 0;
    const unit = body.unit_of_measure ?? 'each';
    const sellPrice: number = body.sell_price_per_unit ?? 0;

    const computed = computeOrderFields(product, qty, unit, sellPrice);

    const newOrder: Order = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      properties: {
        customer: body.customer,
        product_id: body.product_id,
        product_name: product.properties.name,
        quantity: qty,
        unit_of_measure: unit,
        sell_price_per_unit: sellPrice,
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
        notes: body.notes ?? '',
        created_by: 'test-user',
        confirmed_by: null,
        confirmed_at: null,
        cancelled_by: null,
        cancelled_at: null,
      } as OrderProperties,
    };

    const orders = state.orders ?? [];
    orders.push(newOrder);
    state.orders = orders;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(JSON.stringify(newOrder), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PATCH /api/orders/:id
  const patchOrderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (patchOrderMatch && req.method === 'PATCH') {
    const orderId = patchOrderMatch[1];
    const orders = state.orders ?? [];
    const index = orders.findIndex((o) => o.id === orderId);

    if (index === -1) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const existing = orders[index];
    const now = new Date().toISOString();
    const actor = 'test-user';

    const updatedProperties: OrderProperties = { ...existing.properties };

    if (body.status === 'confirmed') {
      updatedProperties.status = 'confirmed';
      updatedProperties.confirmed_by = actor;
      updatedProperties.confirmed_at = now;
    } else if (body.status === 'cancelled') {
      updatedProperties.status = 'cancelled';
      updatedProperties.cancelled_by = actor;
      updatedProperties.cancelled_at = now;
    }

    orders[index] = { ...existing, properties: updatedProperties };
    state.orders = orders;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(JSON.stringify(orders[index]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/users
  if (url.pathname === '/api/users' && req.method === 'GET') {
    const users = (state.users as UserSummary[]) ?? [];
    return new Response(JSON.stringify(users), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PATCH /api/users/:id
  const patchUserMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (patchUserMatch && req.method === 'PATCH') {
    const userId = patchUserMatch[1];
    const users = (state.users as UserSummary[]) ?? [];
    const index = users.findIndex((u) => u.id === userId);

    if (index === -1) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const existing = users[index];
    const updated: UserSummary = {
      ...existing,
      ...(body.role !== undefined ? { role: body.role as UserRole } : {}),
      ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
    };
    users[index] = updated;
    state.users = users;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/inventory — list all products with stock positions
  if (url.pathname === '/api/inventory' && req.method === 'GET') {
    // If explicit inventoryEntries provided, use them; otherwise compute from products
    const explicitEntries = state.inventoryEntries as InventoryEntry[] | undefined;
    if (explicitEntries) {
      return new Response(JSON.stringify(explicitEntries), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const products = state.products ?? [];
    const entries = products.map((p) => ({
      product_id: p.id,
      product_sku: p.properties.sku,
      product_name: p.properties.name,
      position: {
        qty_on_hand: p.properties.qty_on_hand_eaches ?? 0,
        effective_available: p.properties.qty_on_hand_eaches ?? 0,
        committed: 0,
        reorder_point: p.properties.reorder_point_eaches ?? 0,
        safety_stock: p.properties.safety_stock_eaches ?? 0,
        days_of_stock: null,
        status: (p.properties.qty_on_hand_eaches ?? 0) === 0 ? 'critical' : 'healthy',
      },
    }));
    return new Response(JSON.stringify(entries), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/inventory/:productId/availability — simplified for sales_rep
  const availabilityMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/availability$/);
  if (availabilityMatch && req.method === 'GET') {
    const productId = availabilityMatch[1];
    const entries = (state.inventoryEntries as InventoryEntry[]) ?? [];
    const entry = entries.find((e) => e.product_id === productId);
    if (!entry) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const pos = entry.position;
    const statusLabels: Record<string, string> = {
      healthy: 'In Stock',
      warning: 'Low Stock',
      critical: 'Out of Stock',
    };
    return new Response(
      JSON.stringify({
        product_id: productId,
        effective_available: pos.effective_available,
        status: pos.status,
        status_label: statusLabels[pos.status] ?? pos.status,
        can_order: pos.status !== 'critical',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // GET /api/inventory/:productId — full stock position for inventory_manager
  const stockPositionMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
  if (stockPositionMatch && req.method === 'GET') {
    const productId = stockPositionMatch[1];
    const entries = (state.inventoryEntries as InventoryEntry[]) ?? [];
    const entry = entries.find((e) => e.product_id === productId);
    if (!entry) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(entry.position), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/inventory/:productId/adjust
  const adjustMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/adjust$/);
  if (adjustMatch && req.method === 'POST') {
    const productId = adjustMatch[1];
    const body = await req.json();
    const { txn_type, qty_eaches, reference } = body as {
      txn_type: string;
      qty_eaches: number;
      reference: string;
    };

    const products = state.products ?? [];
    const index = products.findIndex((p) => p.id === productId);

    if (index === -1) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const product = products[index];
    const currentQty = product.properties.qty_on_hand_eaches ?? 0;
    const balanceAfter = currentQty + qty_eaches;

    if (balanceAfter < 0) {
      return new Response(
        JSON.stringify({
          error: `Adjustment would result in negative stock. Current: ${currentQty}, Adjustment: ${qty_eaches}, Result: ${balanceAfter}`,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const updatedProps: ProductProperties = {
      ...product.properties,
      qty_on_hand_eaches: balanceAfter,
    };
    products[index] = { ...product, properties: updatedProps };
    state.products = products;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(
      JSON.stringify({
        transaction: {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          properties: {
            product_id: productId,
            product_sku: product.properties.sku,
            txn_type,
            qty_eaches,
            reference,
            balance_after: balanceAfter,
            created_by: 'test-user',
          },
        },
        stock_position: {
          product_id: productId,
          qty_on_hand_eaches: balanceAfter,
          previous_qty: currentQty,
        },
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(
    JSON.stringify({ error: `Unhandled fixture route ${req.method} ${url.pathname}` }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
