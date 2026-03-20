import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

const PORT = 31421;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let inventoryManagerCookie = '';
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

  // Insert an inventory_manager user directly into the database
  const sql = postgres(pg.url, { max: 1 });

  const invMgrUsername = `inv_mgr_txn_${Date.now()}`;
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

  // Register a sales_rep user (default role)
  const salesRepUsername = `sales_rep_txn_${Date.now()}`;
  const salesRepRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: salesRepUsername, password: 'testpass123' }),
  });
  expect(salesRepRes.status).toBe(201);
  const salesRepSetCookie = salesRepRes.headers.get('set-cookie') ?? '';
  salesRepCookie = salesRepSetCookie.split(';')[0];
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Helper to create a product
// ---------------------------------------------------------------------------

async function createProduct(): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: inventoryManagerCookie },
    body: JSON.stringify({
      name: 'Test Wire Mesh',
      sku: `WM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 30.0,
      primary_cost_basis: 'each',
    }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

// ---------------------------------------------------------------------------
// Helper to insert inventory_txn records directly into the database
// ---------------------------------------------------------------------------

async function insertTxn(
  sql: ReturnType<typeof postgres>,
  productId: string,
  txnType: string,
  qtyEaches: number,
  balanceAfter: number,
  createdAt?: Date,
): Promise<void> {
  const id = crypto.randomUUID();
  const props = {
    product_id: productId,
    product_sku: 'TEST-SKU',
    txn_type: txnType,
    qty_eaches: qtyEaches,
    reference: `test-ref-${id}`,
    balance_after: balanceAfter,
    created_by: 'test-user',
  };
  if (createdAt) {
    await sql`
      INSERT INTO entities (id, type, properties, created_at)
      VALUES (${id}, 'inventory_txn', ${sql.json(props)}, ${createdAt})
    `;
  } else {
    await sql`
      INSERT INTO entities (id, type, properties)
      VALUES (${id}, 'inventory_txn', ${sql.json(props)})
    `;
  }
}

// ---------------------------------------------------------------------------
// Transaction log tests
// ---------------------------------------------------------------------------

test('GET /api/inventory/:productId/transactions returns 401 without session', async () => {
  const product = await createProduct();
  const res = await fetch(`${BASE}/api/inventory/${product.id}/transactions`);
  expect(res.status).toBe(401);
});

test('GET /api/inventory/:productId/transactions returns 403 for sales_rep', async () => {
  const product = await createProduct();
  const res = await fetch(`${BASE}/api/inventory/${product.id}/transactions`, {
    headers: { Cookie: salesRepCookie },
  });
  expect(res.status).toBe(403);
});

test('Integration: product with 3 transactions — returns all 3, newest first', async () => {
  const product = await createProduct();
  const sql = postgres(pg.url, { max: 1 });

  // Insert 3 transactions with distinct timestamps
  const t1 = new Date('2026-01-01T10:00:00Z');
  const t2 = new Date('2026-01-02T10:00:00Z');
  const t3 = new Date('2026-01-03T10:00:00Z');

  await insertTxn(sql, product.id, 'initial', 100, 100, t1);
  await insertTxn(sql, product.id, 'adjustment', -20, 80, t2);
  await insertTxn(sql, product.id, 'receipt', 50, 130, t3);

  await sql.end();

  const res = await fetch(`${BASE}/api/inventory/${product.id}/transactions`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(Array.isArray(body.transactions)).toBe(true);
  expect(body.transactions).toHaveLength(3);

  // Verify newest first ordering
  expect(body.transactions[0].txn_type).toBe('receipt');
  expect(body.transactions[1].txn_type).toBe('adjustment');
  expect(body.transactions[2].txn_type).toBe('initial');

  // Verify fields are present
  const txn = body.transactions[0];
  expect(txn).toHaveProperty('id');
  expect(txn).toHaveProperty('created_at');
  expect(txn).toHaveProperty('product_id', product.id);
  expect(txn).toHaveProperty('txn_type');
  expect(txn).toHaveProperty('qty_eaches');
  expect(txn).toHaveProperty('balance_after');
});

test('Integration: limit=1 — returns 1 transaction (newest)', async () => {
  const product = await createProduct();
  const sql = postgres(pg.url, { max: 1 });

  const t1 = new Date('2026-02-01T10:00:00Z');
  const t2 = new Date('2026-02-02T10:00:00Z');
  const t3 = new Date('2026-02-03T10:00:00Z');

  await insertTxn(sql, product.id, 'initial', 100, 100, t1);
  await insertTxn(sql, product.id, 'adjustment', -10, 90, t2);
  await insertTxn(sql, product.id, 'receipt', 40, 130, t3);

  await sql.end();

  const res = await fetch(`${BASE}/api/inventory/${product.id}/transactions?limit=1`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(Array.isArray(body.transactions)).toBe(true);
  expect(body.transactions).toHaveLength(1);
  expect(body.transactions[0].txn_type).toBe('receipt');
});

test('Integration: offset pagination — skips first N transactions', async () => {
  const product = await createProduct();
  const sql = postgres(pg.url, { max: 1 });

  const t1 = new Date('2026-03-01T10:00:00Z');
  const t2 = new Date('2026-03-02T10:00:00Z');
  const t3 = new Date('2026-03-03T10:00:00Z');

  await insertTxn(sql, product.id, 'initial', 100, 100, t1);
  await insertTxn(sql, product.id, 'adjustment', -5, 95, t2);
  await insertTxn(sql, product.id, 'receipt', 30, 125, t3);

  await sql.end();

  // With offset=1, should skip the newest and return the 2nd and 3rd
  const res = await fetch(`${BASE}/api/inventory/${product.id}/transactions?offset=1`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(Array.isArray(body.transactions)).toBe(true);
  expect(body.transactions).toHaveLength(2);
  expect(body.transactions[0].txn_type).toBe('adjustment');
  expect(body.transactions[1].txn_type).toBe('initial');
});

test('Integration: product with no transactions returns empty array', async () => {
  const product = await createProduct();

  const res = await fetch(`${BASE}/api/inventory/${product.id}/transactions`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(Array.isArray(body.transactions)).toBe(true);
  expect(body.transactions).toHaveLength(0);
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
