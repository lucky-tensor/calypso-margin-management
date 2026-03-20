import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

/**
 * Integration tests for the shipped transition on PATCH /api/orders/:id.
 *
 * Verifies:
 * - confirmed → shipped succeeds for inventory_manager
 * - Shipment inventory_txn created with negative qty
 * - Product qty_on_hand decremented
 * - sales_rep gets 403 for shipped transition
 * - draft → shipped returns invalid transition error
 */

const PORT = 31421;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let salesRepCookie = '';
let inventoryManagerCookie = '';
let inventoryManagerId = '';
let pgSql: postgres.Sql;

beforeAll(async () => {
  pg = await startPostgres();

  server = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: pg.url, PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await waitForServer(BASE);

  // Register a sales_rep user (default role)
  const salesRepUsername = `sales_rep_ship_test_${Date.now()}`;
  const salesRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: salesRepUsername, password: 'testpass123' }),
  });
  expect(salesRes.status).toBe(201);
  const salesSetCookie = salesRes.headers.get('set-cookie') ?? '';
  salesRepCookie = salesSetCookie.split(';')[0];

  // Insert an inventory_manager user directly into the database
  pgSql = postgres(pg.url, { max: 1 });
  const invMgrUsername = `inv_mgr_ship_test_${Date.now()}`;
  inventoryManagerId = crypto.randomUUID();
  const invMgrHash = await Bun.password.hash('testpass123');
  await pgSql`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (
      ${inventoryManagerId},
      'user',
      ${pgSql.json({ username: invMgrUsername, password_hash: invMgrHash, role: 'inventory_manager', display_name: 'Test Inventory Manager' })},
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
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pgSql?.end({ timeout: 5 });
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Helper: create a standard test product with known inventory
// ---------------------------------------------------------------------------

async function createTestProduct(qtyOnHand = 100) {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      name: '4x4 Welded Wire Mesh 10ga',
      sku: `WM-SHIP-TEST-${Date.now()}`,
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
      qty_on_hand_eaches: qtyOnHand,
    }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

async function createAndConfirmOrder(productId: string, quantity = 5) {
  // Create order (as sales_rep)
  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({
      customer: `Ship Test Customer ${Date.now()}`,
      product_id: productId,
      quantity,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const order = await createRes.json();

  // Confirm the order (as sales_rep)
  const confirmRes = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  expect(confirmRes.status).toBe(200);
  return confirmRes.json();
}

// ---------------------------------------------------------------------------
// confirmed → shipped succeeds for inventory_manager
// ---------------------------------------------------------------------------

test('confirmed → shipped succeeds for inventory_manager', async () => {
  const product = await createTestProduct(100);
  const confirmedOrder = await createAndConfirmOrder(product.id, 5);
  expect(confirmedOrder.properties.status).toBe('confirmed');

  const shipRes = await fetch(`${BASE}/api/orders/${confirmedOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({ status: 'shipped' }),
  });
  expect(shipRes.status).toBe(200);
  const shipped = await shipRes.json();
  expect(shipped.properties.status).toBe('shipped');
  expect(shipped.properties.shipped_by).toBe(inventoryManagerId);
  expect(shipped.properties.shipped_at).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Shipment inventory_txn created with negative qty
// ---------------------------------------------------------------------------

test('shipment inventory_txn is created with negative qty_eaches', async () => {
  const product = await createTestProduct(100);
  const confirmedOrder = await createAndConfirmOrder(product.id, 7);

  await fetch(`${BASE}/api/orders/${confirmedOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({ status: 'shipped' }),
  });

  // Verify inventory_txn was created in the database
  const txnRows = await pgSql`
    SELECT id, properties
    FROM entities
    WHERE type = 'inventory_txn'
      AND properties->>'reference' = ${confirmedOrder.id}
      AND properties->>'txn_type' = 'shipment'
  `;

  expect(txnRows.length).toBe(1);
  const txn = txnRows[0].properties as Record<string, unknown>;
  expect(txn.qty_eaches).toBe(-7);
  expect(txn.txn_type).toBe('shipment');
  expect(txn.product_id).toBe(product.id);
  expect(txn.reference).toBe(confirmedOrder.id);
});

// ---------------------------------------------------------------------------
// Product qty_on_hand decremented after shipment
// ---------------------------------------------------------------------------

test('product qty_on_hand_eaches decremented by order qty_eaches on shipment', async () => {
  const initialQty = 50;
  const orderQty = 8;
  const product = await createTestProduct(initialQty);
  const confirmedOrder = await createAndConfirmOrder(product.id, orderQty);

  await fetch(`${BASE}/api/orders/${confirmedOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({ status: 'shipped' }),
  });

  // Fetch updated product
  const productRows = await pgSql`
    SELECT properties
    FROM entities
    WHERE id = ${product.id} AND type = 'product'
  `;

  expect(productRows.length).toBe(1);
  const updatedProps = productRows[0].properties as Record<string, unknown>;
  expect(updatedProps.qty_on_hand_eaches).toBe(initialQty - orderQty);
});

// ---------------------------------------------------------------------------
// sales_rep gets 403 for shipped transition
// ---------------------------------------------------------------------------

test('sales_rep gets 403 when attempting shipped transition', async () => {
  const product = await createTestProduct(100);
  const confirmedOrder = await createAndConfirmOrder(product.id, 3);

  const shipRes = await fetch(`${BASE}/api/orders/${confirmedOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({ status: 'shipped' }),
  });

  expect(shipRes.status).toBe(403);
  const body = await shipRes.json();
  expect(body.error).toBe('Forbidden');
});

// ---------------------------------------------------------------------------
// draft → shipped returns invalid transition error
// ---------------------------------------------------------------------------

test('draft → shipped returns 400 invalid transition error', async () => {
  const product = await createTestProduct(100);

  const createRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({
      customer: `Draft Ship Fail ${Date.now()}`,
      product_id: product.id,
      quantity: 3,
      unit_of_measure: 'each',
      sell_price_per_unit: 45.0,
    }),
  });
  expect(createRes.status).toBe(201);
  const draftOrder = await createRes.json();
  expect(draftOrder.properties.status).toBe('draft');

  const shipRes = await fetch(`${BASE}/api/orders/${draftOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({ status: 'shipped' }),
  });

  expect(shipRes.status).toBe(400);
  const body = await shipRes.json();
  expect(body.error).toContain('Invalid status transition');
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
