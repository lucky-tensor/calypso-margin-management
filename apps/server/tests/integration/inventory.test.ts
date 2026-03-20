import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

const PORT = 31420;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let authCookie = '';
let salesRepCookie = '';

beforeAll(async () => {
  pg = await startPostgres();

  server = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: pg.url, PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await waitForServer(BASE);

  // Register and login a default test user
  const username = `test_${Date.now()}`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'testpass123' }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  authCookie = setCookie.split(';')[0];

  // Register a sales_rep user (any authenticated user should access this endpoint)
  const salesRepUsername = `sales_rep_${Date.now()}`;
  const salesRepRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: salesRepUsername, password: 'testpass123' }),
  });
  const salesRepCookieHeader = salesRepRes.headers.get('set-cookie') ?? '';
  salesRepCookie = salesRepCookieHeader.split(';')[0];
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Helper to create a product
// ---------------------------------------------------------------------------

async function createProduct(overrides: Record<string, unknown> = {}): Promise<{ id: string }> {
  const defaults = {
    name: 'Test Mesh Product',
    sku: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    width_inches: 48,
    length_inches: 120,
    cost_per_each: 30.0,
    primary_cost_basis: 'each',
  };
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ ...defaults, ...overrides }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

// ---------------------------------------------------------------------------
// Availability tests
// ---------------------------------------------------------------------------

test('GET /api/inventory/:productId/availability returns 401 without session', async () => {
  const product = await createProduct({ qty_on_hand_eaches: 100 });
  const res = await fetch(`${BASE}/api/inventory/${product.id}/availability`);
  expect(res.status).toBe(401);
});

test('GET /api/inventory/:productId/availability returns 404 for nonexistent product', async () => {
  const res = await fetch(`${BASE}/api/inventory/nonexistent-id/availability`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(404);
});

test('Integration: healthy product returns status "healthy", status_label "In Stock", can_order true', async () => {
  // Create product with high stock well above reorder_point
  const product = await createProduct({
    qty_on_hand_eaches: 200,
    safety_stock_eaches: 10,
    reorder_point_eaches: 20,
    pending_order_weight: 0.7,
  });

  const res = await fetch(`${BASE}/api/inventory/${product.id}/availability`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body.product_id).toBe(product.id);
  expect(body.status).toBe('healthy');
  expect(body.status_label).toBe('In Stock');
  expect(body.can_order).toBe(true);
  expect(typeof body.effective_available).toBe('number');
});

test('Integration: warning product returns status "warning", status_label "Low Stock", can_order true', async () => {
  // Create product where effective_available is between safety_stock and reorder_point
  // qty_on_hand=15, safety_stock=5, reorder_point=20 => effective=15 > safety(5) but <= reorder(20) => warning
  const product = await createProduct({
    qty_on_hand_eaches: 15,
    safety_stock_eaches: 5,
    reorder_point_eaches: 20,
    pending_order_weight: 0.7,
  });

  const res = await fetch(`${BASE}/api/inventory/${product.id}/availability`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body.product_id).toBe(product.id);
  expect(body.status).toBe('warning');
  expect(body.status_label).toBe('Low Stock');
  expect(body.can_order).toBe(true);
  expect(typeof body.effective_available).toBe('number');
});

test('Integration: critical product returns status "critical", status_label "Out of Stock", can_order false', async () => {
  // Create product where effective_available <= safety_stock => critical
  // qty_on_hand=3, safety_stock=10, reorder_point=20 => effective=3 <= safety(10) => critical
  const product = await createProduct({
    qty_on_hand_eaches: 3,
    safety_stock_eaches: 10,
    reorder_point_eaches: 20,
    pending_order_weight: 0.7,
  });

  const res = await fetch(`${BASE}/api/inventory/${product.id}/availability`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body.product_id).toBe(product.id);
  expect(body.status).toBe('critical');
  expect(body.status_label).toBe('Out of Stock');
  expect(body.can_order).toBe(false);
  expect(typeof body.effective_available).toBe('number');
});

test('Integration: sales_rep (any authenticated user) can access availability endpoint', async () => {
  const product = await createProduct({ qty_on_hand_eaches: 100 });

  const res = await fetch(`${BASE}/api/inventory/${product.id}/availability`, {
    headers: { Cookie: salesRepCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.product_id).toBe(product.id);
});

test('Response does NOT contain committed_qty, pending_qty, reorder_point, safety_stock, or weights', async () => {
  const product = await createProduct({ qty_on_hand_eaches: 100 });

  const res = await fetch(`${BASE}/api/inventory/${product.id}/availability`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body).not.toHaveProperty('committed_qty');
  expect(body).not.toHaveProperty('pending_qty');
  expect(body).not.toHaveProperty('reorder_point');
  expect(body).not.toHaveProperty('safety_stock');
  expect(body).not.toHaveProperty('pending_order_weight');
  expect(body).not.toHaveProperty('reorder_qty');
  expect(body).not.toHaveProperty('lead_time_days');
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
