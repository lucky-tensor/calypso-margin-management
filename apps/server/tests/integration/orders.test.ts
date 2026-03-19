import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

const PORT = 31418;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let authCookie = '';
let userId = '';

beforeAll(async () => {
  pg = await startPostgres();

  server = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: pg.url, PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await waitForServer(BASE);

  // Register a test user and capture the session cookie
  const username = `test_${Date.now()}`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'testpass123' }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  authCookie = setCookie.split(';')[0];

  const body = await res.json();
  userId = body.user.id;
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Helper: create a standard test product (Scenario 1 from PRD)
// ---------------------------------------------------------------------------

async function createTestProduct() {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: '4x4 Welded Wire Mesh 10ga',
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
    }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth guard tests
// ---------------------------------------------------------------------------

test('GET /api/orders returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/orders`);
  expect(res.status).toBe(401);
});

test('POST /api/orders returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(401);
});

test('PATCH /api/orders/:id returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/orders/some-id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(res.status).toBe(401);
});

// ---------------------------------------------------------------------------
// GET /api/orders
// ---------------------------------------------------------------------------

test('GET /api/orders returns 200 with empty array initially', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

// ---------------------------------------------------------------------------
// POST /api/orders — PRD Scenario 1
// ---------------------------------------------------------------------------

test('POST /api/orders with non-existent product_id returns 404', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Acme Fencing Co',
      product_id: 'nonexistent-product-id',
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('POST /api/orders computes correct fields matching PRD Scenario 1', async () => {
  const product = await createTestProduct();

  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Acme Fencing Co',
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(201);
  const order = await res.json();

  expect(order.id).toBeTruthy();
  expect(order.created_at).toBeTruthy();

  const p = order.properties;
  expect(p.customer).toBe('Acme Fencing Co');
  expect(p.product_id).toBe(product.id);
  expect(p.product_name).toBe('4x4 Welded Wire Mesh 10ga');
  expect(p.quantity).toBe(10);
  expect(p.unit_of_measure).toBe('each');
  expect(p.sell_price_per_unit).toBe(45.0);
  expect(p.status).toBe('draft');

  // Conversions: 10 eaches, 100 linear feet, 400 square feet
  expect(p.qty_eaches).toBe(10);
  expect(p.qty_linft).toBe(100);
  expect(p.qty_sqft).toBe(400);

  // Economics: revenue=$450, cost=$320, margin=$130 (28.9%)
  expect(p.total_revenue).toBe(450.0);
  expect(p.total_cost).toBe(320.0);
  expect(p.margin_dollars).toBe(130.0);
  expect(p.margin_percent).toBeCloseTo(28.89, 1);

  // Margin threshold snapshot from product
  expect(p.margin_target).toBe(25);
  expect(p.margin_floor).toBe(15);

  // Audit fields
  expect(p.created_by).toBe(userId);
  expect(p.confirmed_by).toBeNull();
  expect(p.confirmed_at).toBeNull();
  expect(p.cancelled_by).toBeNull();
  expect(p.cancelled_at).toBeNull();
});

test('POST /api/orders sets created_by from authenticated user', async () => {
  const product = await createTestProduct();

  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Test Customer',
      product_id: product.id,
      quantity: 1,
      unit_of_measure: 'each',
      sell_price_per_unit: 50.0,
    }),
  });
  expect(res.status).toBe(201);
  const order = await res.json();
  expect(order.properties.created_by).toBe(userId);
  expect(order.properties.status).toBe('draft');
});

test('POST /api/orders snapshots margin_target and margin_floor from product', async () => {
  // Create a product with custom margin thresholds
  const productRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Custom Margin Product',
      sku: 'CMP-001',
      width_inches: 24,
      length_inches: 60,
      cost_per_each: 10.0,
      primary_cost_basis: 'each',
      margin_target: 30,
      margin_floor: 20,
    }),
  });
  expect(productRes.status).toBe(201);
  const product = await productRes.json();

  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Margin Snapshot Test',
      product_id: product.id,
      quantity: 5,
      unit_of_measure: 'each',
      sell_price_per_unit: 20.0,
    }),
  });
  expect(res.status).toBe(201);
  const order = await res.json();
  expect(order.properties.margin_target).toBe(30);
  expect(order.properties.margin_floor).toBe(20);
});

// ---------------------------------------------------------------------------
// GET /api/orders with filters
// ---------------------------------------------------------------------------

test('GET /api/orders returns created order in the list', async () => {
  const product = await createTestProduct();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Listed Order Customer',
      product_id: product.id,
      quantity: 2,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const created = await createRes.json();

  const listRes = await fetch(`${BASE}/api/orders`, {
    headers: { Cookie: authCookie },
  });
  expect(listRes.status).toBe(200);
  const orders = await listRes.json();
  const found = orders.find((o: { id: string }) => o.id === created.id);
  expect(found).toBeTruthy();
});

test('GET /api/orders?status=draft filters by status', async () => {
  const product = await createTestProduct();

  // Create a draft order
  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Draft Filter Customer',
      product_id: product.id,
      quantity: 3,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const draftOrder = await createRes.json();

  // Filter by status=draft
  const listRes = await fetch(`${BASE}/api/orders?status=draft`, {
    headers: { Cookie: authCookie },
  });
  expect(listRes.status).toBe(200);
  const orders = await listRes.json();

  // All returned orders should be drafts
  for (const o of orders) {
    expect(o.properties.status).toBe('draft');
  }

  // Our order should be in the list
  const found = orders.find((o: { id: string }) => o.id === draftOrder.id);
  expect(found).toBeTruthy();
});

test('GET /api/orders?customer=Acme filters by customer (case-insensitive partial match)', async () => {
  const product = await createTestProduct();

  // Create an order with a distinctive customer name
  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'AcmeFencing Special Customer',
      product_id: product.id,
      quantity: 1,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const acmeOrder = await createRes.json();

  // Filter by customer=acmefencing (lowercase)
  const listRes = await fetch(`${BASE}/api/orders?customer=acmefencing`, {
    headers: { Cookie: authCookie },
  });
  expect(listRes.status).toBe(200);
  const orders = await listRes.json();

  // Our order should be in the list
  const found = orders.find((o: { id: string }) => o.id === acmeOrder.id);
  expect(found).toBeTruthy();

  // All returned orders should match (case-insensitive)
  for (const o of orders) {
    expect(o.properties.customer.toLowerCase()).toContain('acmefencing');
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/orders/:id — status transitions
// ---------------------------------------------------------------------------

test('PATCH /api/orders/:id with status=confirmed sets confirmed_by and confirmed_at', async () => {
  const product = await createTestProduct();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Confirm Test Customer',
      product_id: product.id,
      quantity: 5,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();
  expect(order.properties.status).toBe('draft');

  const patchRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(patchRes.status).toBe(200);
  const updated = await patchRes.json();
  expect(updated.properties.status).toBe('confirmed');
  expect(updated.properties.confirmed_by).toBe(userId);
  expect(updated.properties.confirmed_at).toBeTruthy();
  expect(updated.properties.cancelled_by).toBeNull();
  expect(updated.properties.cancelled_at).toBeNull();
});

test('PATCH /api/orders/:id with status=cancelled sets cancelled_by and cancelled_at', async () => {
  const product = await createTestProduct();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Cancel Test Customer',
      product_id: product.id,
      quantity: 2,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();

  const patchRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  expect(patchRes.status).toBe(200);
  const updated = await patchRes.json();
  expect(updated.properties.status).toBe('cancelled');
  expect(updated.properties.cancelled_by).toBe(userId);
  expect(updated.properties.cancelled_at).toBeTruthy();
});

test('PATCH /api/orders/:id with invalid transition (confirmed->draft) returns 400', async () => {
  const product = await createTestProduct();

  // Create and confirm an order
  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Invalid Transition Customer',
      product_id: product.id,
      quantity: 1,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();

  // Confirm the order
  const confirmRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(confirmRes.status).toBe(200);

  // Try invalid transition: confirmed -> draft
  const invalidRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'draft' }),
  });
  expect(invalidRes.status).toBe(400);
  const body = await invalidRes.json();
  expect(body.error).toBeTruthy();
});

test('PATCH /api/orders/:id cancelled->confirmed returns 400 (invalid transition)', async () => {
  const product = await createTestProduct();

  // Create and cancel an order
  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Cancelled To Confirmed Customer',
      product_id: product.id,
      quantity: 1,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();

  await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'cancelled' }),
  });

  // Try invalid transition: cancelled -> confirmed
  const invalidRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(invalidRes.status).toBe(400);
});

test('PATCH /api/orders/:id updates notes without changing status', async () => {
  const product = await createTestProduct();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Notes Test Customer',
      product_id: product.id,
      quantity: 1,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
      notes: 'original notes',
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();

  const patchRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ notes: 'updated notes' }),
  });
  expect(patchRes.status).toBe(200);
  const updated = await patchRes.json();
  expect(updated.properties.notes).toBe('updated notes');
  expect(updated.properties.status).toBe('draft');
});

test('PATCH /api/orders/:id returns 404 for nonexistent order', async () => {
  const res = await fetch(`${BASE}/api/orders/nonexistent-order-id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(res.status).toBe(404);
});

// ---------------------------------------------------------------------------
// POST /api/orders — missing field rejection
// ---------------------------------------------------------------------------

test('POST /api/orders missing customer returns 400', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('customer');
});

test('POST /api/orders missing product_id returns 400', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Test Customer',
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('product_id');
});

test('POST /api/orders missing quantity returns 400', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Test Customer',
      product_id: product.id,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('quantity');
});

test('POST /api/orders missing unit_of_measure returns 400', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Test Customer',
      product_id: product.id,
      quantity: 10,
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('unit_of_measure');
});

test('POST /api/orders missing sell_price_per_unit returns 400', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Test Customer',
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'each',
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('sell_price_per_unit');
});

// ---------------------------------------------------------------------------
// POST /api/orders — invalid unit_of_measure
// ---------------------------------------------------------------------------

test('POST /api/orders with invalid unit_of_measure returns 400', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Test Customer',
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'kilogram',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('kilogram');
});

// ---------------------------------------------------------------------------
// POST /api/orders — quantity edge cases
// ---------------------------------------------------------------------------

test('POST /api/orders with quantity=0 returns 201', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Zero Quantity Customer',
      product_id: product.id,
      quantity: 0,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  // quantity=0 → revenue=0, cost=0, margin_percent=0 which is < floor 15 → 400
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('Margin below floor');
});

// ---------------------------------------------------------------------------
// POST /api/orders — margin floor enforcement
// ---------------------------------------------------------------------------

test('POST /api/orders returns 400 when margin is below floor', async () => {
  // Product: cost_per_each=$32, margin_floor=15%
  // At 10 eaches, cost=$320
  // For margin_percent = 14% (below floor):
  //   margin_percent = (revenue - cost) / revenue * 100 = 14
  //   revenue - cost = 0.14 * revenue
  //   revenue = cost / (1 - 0.14) = 320 / 0.86 ≈ 372.09
  //   sell_price_per_unit = 372.09 / 10 ≈ 37.21
  // Let's use $37/each → revenue=$370, margin=$50, margin%=13.51% (below 15%)
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Below Floor Customer',
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 37.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('Margin below floor');
});

test('POST /api/orders returns 201 when margin equals exactly the floor (inclusive)', async () => {
  // Product: cost_per_each=$32, margin_floor=15%
  // For margin_percent = 15% (at floor):
  //   revenue = cost / (1 - 0.15) = 320 / 0.85 ≈ 376.47
  //   sell_price_per_unit = 376.47 / 10 ≈ 37.647...
  // Exact: sell = 320 / (10 * 0.85) = 37.647058...
  // Let's compute: 10 * 37.647058823529 = 376.47058..., cost=320
  // margin = 56.47058..., margin% = 56.47058.../376.47058... * 100 = 15.0000...
  const product = await createTestProduct();
  const exactSellPrice = 32 / 0.85; // 37.647058823529...
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'At Floor Customer',
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: exactSellPrice,
    }),
  });
  expect(res.status).toBe(201);
  const order = await res.json();
  expect(order.properties.margin_percent).toBeCloseTo(15, 1);
});

// ---------------------------------------------------------------------------
// POST /api/orders — malformed body
// ---------------------------------------------------------------------------

test('POST /api/orders with non-JSON body returns 400', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Cookie: authCookie },
    body: 'this is not json',
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('Invalid JSON');
});

test('POST /api/orders with empty body returns 400', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: '',
  });
  expect(res.status).toBe(400);
});

// ---------------------------------------------------------------------------
// POST /api/orders — empty string customer name
// ---------------------------------------------------------------------------

test('POST /api/orders with empty string customer returns 400', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: '',
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('customer');
});

test('POST /api/orders with whitespace-only customer returns 400', async () => {
  const product = await createTestProduct();
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: '   ',
      product_id: product.id,
      quantity: 10,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('customer');
});

// ---------------------------------------------------------------------------
// PATCH /api/orders/:id — malformed JSON body
// ---------------------------------------------------------------------------

test('PATCH /api/orders/:id with malformed JSON returns error (not 500)', async () => {
  const product = await createTestProduct();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Malformed PATCH Customer',
      product_id: product.id,
      quantity: 5,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();

  const patchRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: 'not valid json{{{',
  });
  expect(patchRes.status).toBe(400);
  const body = await patchRes.json();
  expect(body.error).toContain('Invalid JSON');
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
