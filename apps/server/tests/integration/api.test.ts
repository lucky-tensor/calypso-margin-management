import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

// Each test run gets its own isolated postgres container + server process.

const PORT = 31416;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
/** inventory_manager cookie — used for product write operations (POST, PATCH) */
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

  // Insert an inventory_manager user directly into the database so that
  // product write operations (POST, PATCH) are authorised.
  const sql = postgres(pg.url, { max: 1 });
  const invMgrUsername = `inv_mgr_api_${Date.now()}`;
  const invMgrId = crypto.randomUUID();
  const invMgrHash = await Bun.password.hash('testpass123');
  await sql`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (
      ${invMgrId},
      'user',
      ${sql.json({ username: invMgrUsername, password_hash: invMgrHash, role: 'inventory_manager' })},
      null
    )
  `;
  await sql.end();

  // Log in as the inventory_manager
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: invMgrUsername, password: 'testpass123' }),
  });
  expect(res.status).toBe(200);
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
// Auth tests
// ---------------------------------------------------------------------------

test('GET /api/auth/me returns 200 with valid session', async () => {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.user).toBeTruthy();
  expect(body.user.username).toBeTruthy();
});

test('GET /api/auth/me returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/auth/me`);
  expect(res.status).toBe(401);
});

// ---------------------------------------------------------------------------
// Products tests
// ---------------------------------------------------------------------------

const validProduct = {
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
};

test('GET /api/products returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/products`);
  expect(res.status).toBe(401);
});

test('POST /api/products returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validProduct),
  });
  expect(res.status).toBe(401);
});

test('GET /api/products returns 200 with array', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test('POST /api/products with valid data returns 201 with generated id', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify(validProduct),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.id).toBeTruthy();
  expect(body.created_at).toBeTruthy();
  expect(body.properties.name).toBe(validProduct.name);
  expect(body.properties.sku).toBe(validProduct.sku);
  expect(body.properties.primary_cost_basis).toBe('each');
});

test('POST /api/products applies default margin values when not provided', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Test Product Defaults',
      sku: 'TPD-001-API',
      width_inches: 24,
      length_inches: 60,
      cost_per_each: 10.0,
      primary_cost_basis: 'each',
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.properties.margin_target).toBe(25);
  expect(body.properties.margin_floor).toBe(15);
  expect(body.properties.weight_per_sqft).toBe(0);
});

test('GET /api/products returns created product in list', async () => {
  const createRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Listed Product API',
      sku: 'LP-API-001',
      width_inches: 36,
      length_inches: 72,
      cost_per_each: 20.0,
      primary_cost_basis: 'each',
    }),
  });
  expect(createRes.status).toBe(201);
  const created = await createRes.json();

  const listRes = await fetch(`${BASE}/api/products`, {
    headers: { Cookie: authCookie },
  });
  expect(listRes.status).toBe(200);
  const products = await listRes.json();
  const found = products.find((p: { id: string }) => p.id === created.id);
  expect(found).toBeTruthy();
});

test('POST /api/products with invalid data (missing name) returns 400', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      sku: 'NONAME-API-001',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 10,
      primary_cost_basis: 'each',
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('POST /api/products with invalid data (missing sku) returns 400', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'No SKU Product API',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 10,
      primary_cost_basis: 'each',
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('POST /api/products with cost_per_each=null when primary_cost_basis=each returns 400', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Mismatched Cost API',
      sku: 'MC-API-001',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: null,
      primary_cost_basis: 'each',
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('cost_per_each');
});

test('POST /api/products with zero width_inches returns 400', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Zero Width API',
      sku: 'ZW-API-001',
      width_inches: 0,
      length_inches: 120,
      cost_per_each: 10,
      primary_cost_basis: 'each',
    }),
  });
  expect(res.status).toBe(400);
});

test('PATCH /api/products/:id updates only supplied fields', async () => {
  const createRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Original Name API',
      sku: 'ORIG-API-001',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 30.0,
      primary_cost_basis: 'each',
    }),
  });
  expect(createRes.status).toBe(201);
  const created = await createRes.json();

  const patchRes = await fetch(`${BASE}/api/products/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ name: 'Updated Name API' }),
  });
  expect(patchRes.status).toBe(200);
  const updated = await patchRes.json();
  expect(updated.properties.name).toBe('Updated Name API');
  // Unchanged fields preserved
  expect(updated.properties.sku).toBe('ORIG-API-001');
  expect(updated.properties.cost_per_each).toBe(30.0);
  expect(updated.properties.primary_cost_basis).toBe('each');
});

test('PATCH /api/products/:id returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/products/some-id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacked' }),
  });
  expect(res.status).toBe(401);
});

test('PATCH /api/products/:id returns 404 for nonexistent product', async () => {
  const res = await fetch(`${BASE}/api/products/nonexistent-id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ name: 'Ghost' }),
  });
  expect(res.status).toBe(404);
});

// ---------------------------------------------------------------------------
// Orders tests
// ---------------------------------------------------------------------------

/** Create the PRD Scenario 1 product and return the entity. */
async function createScenario1Product() {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: '4x4 Welded Wire Mesh 10ga',
      sku: `WM-4X4-10GA-${Date.now()}`,
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
      qty_on_hand_eaches: 1000,
      safety_stock_eaches: 10,
      reorder_point_eaches: 50,
      pending_order_weight: 1.0,
    }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

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

test('GET /api/orders returns 200 with array', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

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

test('POST /api/orders computes correct conversions, cost, and margin for PRD Scenario 1', async () => {
  // Cross-entity: create product, then create order referencing it, verify margin math
  const product = await createScenario1Product();

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

  // PRD Scenario 1 conversions: 10 eaches = 100 linft = 400 sqft
  expect(p.qty_eaches).toBe(10);
  expect(p.qty_linft).toBe(100);
  expect(p.qty_sqft).toBe(400);

  // PRD Scenario 1 economics: revenue=$450, cost=$320, margin=$130 (28.9%)
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

test('POST /api/orders snapshots margin_target and margin_floor from product', async () => {
  const productRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Custom Margin Product API',
      sku: `CMP-API-${Date.now()}`,
      width_inches: 24,
      length_inches: 60,
      cost_per_each: 10.0,
      primary_cost_basis: 'each',
      margin_target: 30,
      margin_floor: 20,
      qty_on_hand_eaches: 1000,
      safety_stock_eaches: 10,
      reorder_point_eaches: 50,
      pending_order_weight: 1.0,
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

test('GET /api/orders returns created order in list', async () => {
  const product = await createScenario1Product();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Listed Order Customer API',
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
  const product = await createScenario1Product();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Draft Filter Customer API',
      product_id: product.id,
      quantity: 3,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const draftOrder = await createRes.json();

  const listRes = await fetch(`${BASE}/api/orders?status=draft`, {
    headers: { Cookie: authCookie },
  });
  expect(listRes.status).toBe(200);
  const orders = await listRes.json();

  // All returned orders must be drafts
  for (const o of orders) {
    expect(o.properties.status).toBe('draft');
  }

  const found = orders.find((o: { id: string }) => o.id === draftOrder.id);
  expect(found).toBeTruthy();
});

test('GET /api/orders?customer= filters by customer name', async () => {
  const product = await createScenario1Product();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'AcmeFencingAPITest',
      product_id: product.id,
      quantity: 1,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const acmeOrder = await createRes.json();

  // Filter by lowercase partial match
  const listRes = await fetch(`${BASE}/api/orders?customer=acmefencingapitest`, {
    headers: { Cookie: authCookie },
  });
  expect(listRes.status).toBe(200);
  const orders = await listRes.json();

  const found = orders.find((o: { id: string }) => o.id === acmeOrder.id);
  expect(found).toBeTruthy();

  for (const o of orders) {
    expect(o.properties.customer.toLowerCase()).toContain('acmefencingapitest');
  }
});

test('PATCH /api/orders/:id draft→confirmed sets confirmed_by and confirmed_at audit fields', async () => {
  const product = await createScenario1Product();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Confirm Test Customer API',
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

test('PATCH /api/orders/:id confirmed→draft returns 400 (invalid transition)', async () => {
  const product = await createScenario1Product();

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      customer: 'Invalid Transition Customer API',
      product_id: product.id,
      quantity: 1,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();

  // First confirm
  const confirmRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(confirmRes.status).toBe(200);

  // Attempt invalid confirmed → draft
  const invalidRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ status: 'draft' }),
  });
  expect(invalidRes.status).toBe(400);
  const body = await invalidRes.json();
  expect(body.error).toBeTruthy();
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
