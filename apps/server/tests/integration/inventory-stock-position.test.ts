import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

const PORT = 31422;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let salesRepCookie = '';
let inventoryManagerCookie = '';
let adminCookie = '';

beforeAll(async () => {
  pg = await startPostgres();

  server = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: pg.url,
      PORT: String(PORT),
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-only-secret',
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await waitForServer(BASE);

  const sql = postgres(pg.url, { max: 1 });

  // Register a sales_rep user via the API (default role)
  const salesRepUsername = `sales_rep_${Date.now()}`;
  const salesRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: salesRepUsername, password: 'testpass123' }),
  });
  expect(salesRes.status).toBe(201);
  const salesSetCookie = salesRes.headers.get('set-cookie') ?? '';
  salesRepCookie = salesSetCookie.split(';')[0];

  // Insert an inventory_manager user directly into the database
  const invMgrUsername = `inv_mgr_${Date.now()}`;
  const invMgrId = crypto.randomUUID();
  const invMgrHash = await Bun.password.hash('testpass123');
  await sql`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (
      ${invMgrId},
      'user',
      ${sql.json({ username: invMgrUsername, password_hash: invMgrHash, role: 'inventory_manager', display_name: 'Test Inventory Manager' })},
      null
    )
  `;

  // Log in as the inventory_manager
  const invMgrRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: invMgrUsername, password: 'testpass123' }),
  });
  expect(invMgrRes.status).toBe(200);
  const invMgrSetCookie = invMgrRes.headers.get('set-cookie') ?? '';
  inventoryManagerCookie = invMgrSetCookie.split(';')[0];

  // Insert an admin user directly into the database
  const adminUsername = `admin_${Date.now()}`;
  const adminId = crypto.randomUUID();
  const adminHash = await Bun.password.hash('testpass123');
  await sql`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (
      ${adminId},
      'user',
      ${sql.json({ username: adminUsername, password_hash: adminHash, role: 'admin', display_name: 'Test Admin' })},
      null
    )
  `;

  // Log in as the admin
  const adminRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: 'testpass123' }),
  });
  expect(adminRes.status).toBe(200);
  const adminSetCookie = adminRes.headers.get('set-cookie') ?? '';
  adminCookie = adminSetCookie.split(';')[0];

  await sql.end();
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Helper to create a product using inventory_manager cookie
// ---------------------------------------------------------------------------

async function createProduct(overrides: Record<string, unknown> = {}): Promise<{ id: string }> {
  const defaults = {
    name: 'Test Stock Position Product',
    sku: `SP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    width_inches: 48,
    length_inches: 120,
    cost_per_each: 30.0,
    primary_cost_basis: 'each',
    qty_on_hand_eaches: 100,
    safety_stock_eaches: 10,
    reorder_point_eaches: 20,
    pending_order_weight: 0.7,
  };
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({ ...defaults, ...overrides }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

// ---------------------------------------------------------------------------
// Role access tests
// ---------------------------------------------------------------------------

test('GET /api/inventory/:productId returns 401 without session', async () => {
  const product = await createProduct();
  const res = await fetch(`${BASE}/api/inventory/${product.id}`);
  expect(res.status).toBe(401);
});

test('GET /api/inventory/:productId returns 403 for sales_rep', async () => {
  const product = await createProduct();
  const res = await fetch(`${BASE}/api/inventory/${product.id}`, {
    headers: { Cookie: salesRepCookie },
  });
  expect(res.status).toBe(403);
});

test('GET /api/inventory/:productId returns 404 for nonexistent product', async () => {
  const res = await fetch(`${BASE}/api/inventory/nonexistent-product-id`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(404);
});

// ---------------------------------------------------------------------------
// Full stock position tests
// ---------------------------------------------------------------------------

test('Integration: product with known orders returns correct StockPosition values', async () => {
  // qty_on_hand=100, confirmed orders=30, draft orders=20, pending_weight=0.7
  // committed_qty = 30
  // pending_qty = 20
  // net_available = 100 - 30 = 70
  // effective_available = 100 - 30 - 20 * 0.7 = 100 - 30 - 14 = 56
  // safety_stock=10, reorder_point=20 => 56 > 20 => healthy
  const product = await createProduct({
    qty_on_hand_eaches: 100,
    safety_stock_eaches: 10,
    reorder_point_eaches: 20,
    pending_order_weight: 0.7,
    reorder_qty_eaches: 50,
    lead_time_days: 7,
  });

  // Create confirmed order for 30 eaches
  const confirmedOrderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({
      customer: 'Test Customer',
      product_id: product.id,
      quantity: 30,
      unit_of_measure: 'each',
      sell_price_per_unit: 50,
    }),
  });
  expect(confirmedOrderRes.status).toBe(201);
  const confirmedOrder = await confirmedOrderRes.json();

  // Confirm the order
  const confirmRes = await fetch(`${BASE}/api/orders/${confirmedOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(confirmRes.status).toBe(200);

  // Create draft order for 20 eaches
  const draftOrderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({
      customer: 'Test Customer 2',
      product_id: product.id,
      quantity: 20,
      unit_of_measure: 'each',
      sell_price_per_unit: 50,
    }),
  });
  expect(draftOrderRes.status).toBe(201);

  // Call GET /api/inventory/:productId
  const res = await fetch(`${BASE}/api/inventory/${product.id}`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  // Verify all StockPosition fields are present
  expect(body).toHaveProperty('qty_on_hand');
  expect(body).toHaveProperty('committed_qty');
  expect(body).toHaveProperty('pending_qty');
  expect(body).toHaveProperty('net_available');
  expect(body).toHaveProperty('effective_available');
  expect(body).toHaveProperty('status');
  expect(body).toHaveProperty('reorder_point');
  expect(body).toHaveProperty('safety_stock');
  expect(body).toHaveProperty('reorder_qty');
  expect(body).toHaveProperty('lead_time_days');
  expect(body).toHaveProperty('days_of_stock');

  // Verify computed values
  expect(body.qty_on_hand).toBe(100);
  expect(body.committed_qty).toBe(30);
  expect(body.pending_qty).toBe(20);
  expect(body.net_available).toBe(70);
  expect(body.effective_available).toBeCloseTo(56, 5);
  expect(body.status).toBe('healthy');
  expect(body.reorder_point).toBe(20);
  expect(body.safety_stock).toBe(10);
  expect(body.reorder_qty).toBe(50);
  expect(body.lead_time_days).toBe(7);
});

test('Integration: admin can access full stock position endpoint', async () => {
  const product = await createProduct({ qty_on_hand_eaches: 50 });

  const res = await fetch(`${BASE}/api/inventory/${product.id}`, {
    headers: { Cookie: adminCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('qty_on_hand');
  expect(body).toHaveProperty('committed_qty');
  expect(body).toHaveProperty('effective_available');
  expect(body).toHaveProperty('status');
});

test('Integration: product with no orders has committed_qty=0 and pending_qty=0', async () => {
  const product = await createProduct({
    qty_on_hand_eaches: 200,
    safety_stock_eaches: 10,
    reorder_point_eaches: 20,
  });

  const res = await fetch(`${BASE}/api/inventory/${product.id}`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body.committed_qty).toBe(0);
  expect(body.pending_qty).toBe(0);
  expect(body.qty_on_hand).toBe(200);
  expect(body.net_available).toBe(200);
  expect(body.effective_available).toBe(200);
  expect(body.status).toBe('healthy');
});

// ---------------------------------------------------------------------------

/** Poll the server until it responds or we time out. */
async function waitForServer(base: string): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`${base}/api/auth/me`);
      return;
    } catch {
      await Bun.sleep(300);
    }
  }
  throw new Error(`Server at ${base} did not become ready within ${SERVER_READY_TIMEOUT_MS}ms`);
}
