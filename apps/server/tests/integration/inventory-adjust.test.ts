import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

/**
 * Integration tests for POST /api/inventory/:productId/adjust
 *
 * Verifies:
 * - Receipt transaction increases qty_on_hand
 * - Negative adjustment that would go below 0 returns 400
 * - sales_rep gets 403
 * - txn_type 'shipment' returns 400
 * - txn_type 'initial' returns 400
 * - Transaction is immutable (no update/delete endpoint)
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
let testProductId = '';

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

  // Register a sales_rep user via the API (default role)
  const salesRepUsername = `sales_rep_inv_${Date.now()}`;
  const salesRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: salesRepUsername, password: 'testpass123' }),
  });
  expect(salesRes.status).toBe(201);
  const salesSetCookie = salesRes.headers.get('set-cookie') ?? '';
  salesRepCookie = salesSetCookie.split(';')[0];

  // Insert an inventory_manager user directly into the database
  const sql = postgres(pg.url, { max: 1 });
  const invMgrUsername = `inv_mgr_inv_${Date.now()}`;
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
  await sql.end();

  // Log in as the inventory_manager
  const invMgrRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: invMgrUsername, password: 'testpass123' }),
  });
  expect(invMgrRes.status).toBe(200);
  const invMgrSetCookie = invMgrRes.headers.get('set-cookie') ?? '';
  inventoryManagerCookie = invMgrSetCookie.split(';')[0];

  // Create a test product with known initial qty
  const productRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      name: 'Inventory Test Product',
      sku: 'INV-TEST-001',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 30.0,
      primary_cost_basis: 'each',
      qty_on_hand_eaches: 100,
    }),
  });
  expect(productRes.status).toBe(201);
  const product = await productRes.json();
  testProductId = product.id;
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Inventory adjust tests
// ---------------------------------------------------------------------------

test('POST /api/inventory/:productId/adjust — receipt of 50 increases balance by 50', async () => {
  // Create a fresh product to test receipt
  const productRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      name: 'Receipt Test Product',
      sku: 'RCP-TEST-001',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 20.0,
      primary_cost_basis: 'each',
      qty_on_hand_eaches: 50,
    }),
  });
  expect(productRes.status).toBe(201);
  const product = await productRes.json();
  const productId = product.id;
  const initialQty = product.properties.qty_on_hand_eaches;
  expect(initialQty).toBe(50);

  const res = await fetch(`${BASE}/api/inventory/${productId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      txn_type: 'receipt',
      qty_eaches: 50,
      reference: 'PO-001',
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();

  // Transaction details
  expect(body.transaction.id).toBeTruthy();
  expect(body.transaction.properties.txn_type).toBe('receipt');
  expect(body.transaction.properties.qty_eaches).toBe(50);
  expect(body.transaction.properties.balance_after).toBe(100);
  expect(body.transaction.properties.reference).toBe('PO-001');
  expect(body.transaction.properties.product_id).toBe(productId);

  // Stock position
  expect(body.stock_position.qty_on_hand_eaches).toBe(100);
  expect(body.stock_position.previous_qty).toBe(50);

  // Product updated
  expect(body.product.properties.qty_on_hand_eaches).toBe(100);
});

test('POST /api/inventory/:productId/adjust — adjustment of -200 on product with 100 returns 400', async () => {
  const res = await fetch(`${BASE}/api/inventory/${testProductId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      txn_type: 'adjustment',
      qty_eaches: -200,
      reference: 'ADJ-001',
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
  expect(body.error).toContain('negative');
});

test('POST /api/inventory/:productId/adjust — sales_rep returns 403', async () => {
  const res = await fetch(`${BASE}/api/inventory/${testProductId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({
      txn_type: 'receipt',
      qty_eaches: 10,
      reference: 'TEST-001',
    }),
  });
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toBe('Forbidden');
});

test('POST /api/inventory/:productId/adjust — txn_type shipment returns 400', async () => {
  const res = await fetch(`${BASE}/api/inventory/${testProductId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      txn_type: 'shipment',
      qty_eaches: 10,
      reference: 'SHIP-001',
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('txn_type');
});

test('POST /api/inventory/:productId/adjust — txn_type initial returns 400', async () => {
  const res = await fetch(`${BASE}/api/inventory/${testProductId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      txn_type: 'initial',
      qty_eaches: 10,
      reference: 'INIT-001',
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('txn_type');
});

test('POST /api/inventory/:productId/adjust — unauthenticated returns 401', async () => {
  const res = await fetch(`${BASE}/api/inventory/${testProductId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txn_type: 'receipt',
      qty_eaches: 10,
      reference: 'TEST-001',
    }),
  });
  expect(res.status).toBe(401);
});

test('POST /api/inventory/:productId/adjust — nonexistent product returns 404', async () => {
  const res = await fetch(`${BASE}/api/inventory/nonexistent-product-id/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      txn_type: 'receipt',
      qty_eaches: 10,
      reference: 'TEST-001',
    }),
  });
  expect(res.status).toBe(404);
});

test('POST /api/inventory/:productId/adjust — return transaction decreases balance', async () => {
  // Create fresh product with 100 qty
  const productRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      name: 'Return Test Product',
      sku: 'RTN-TEST-001',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 20.0,
      primary_cost_basis: 'each',
      qty_on_hand_eaches: 100,
    }),
  });
  expect(productRes.status).toBe(201);
  const product = await productRes.json();
  const productId = product.id;

  const res = await fetch(`${BASE}/api/inventory/${productId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      txn_type: 'return',
      qty_eaches: -10,
      reference: 'RTN-001',
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.transaction.properties.txn_type).toBe('return');
  expect(body.transaction.properties.balance_after).toBe(90);
  expect(body.product.properties.qty_on_hand_eaches).toBe(90);
});

test('Transaction is immutable — no PATCH/DELETE endpoint for inventory_txn', async () => {
  // First create a transaction
  const adjustRes = await fetch(`${BASE}/api/inventory/${testProductId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      txn_type: 'receipt',
      qty_eaches: 5,
      reference: 'IMMUT-TEST',
    }),
  });
  expect(adjustRes.status).toBe(201);
  const { transaction } = await adjustRes.json();
  const txnId = transaction.id;

  // Attempt PATCH — no PATCH handler exists for transactions
  const patchRes = await fetch(`${BASE}/api/inventory/txn/${txnId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({ qty_eaches: 999 }),
  });
  expect(patchRes.status).not.toBe(200);

  const deleteRes = await fetch(`${BASE}/api/inventory/txn/${txnId}`, {
    method: 'DELETE',
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(deleteRes.status).not.toBe(200);
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
