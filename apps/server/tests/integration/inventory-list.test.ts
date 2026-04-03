import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import { startPostgres, type PgContainer } from '../helpers/pg-container';
import type { StockPosition } from 'core';

/**
 * Integration tests for GET /api/inventory (all products list).
 *
 * Verifies:
 * - Returns stock positions for all 5 seeded products
 * - Each entry includes product_id, product_sku, product_name
 * - sales_rep role gets 403
 * - inventory_manager role gets 200
 */

const PORT = 31422;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let salesRepCookie = '';
let inventoryManagerCookie = '';

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

  // Log in as seeded sales_rep demo user
  const salesRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sales_rep', password: 'demo1234' }),
  });
  expect(salesRes.status).toBe(200);
  const salesSetCookie = salesRes.headers.get('set-cookie') ?? '';
  salesRepCookie = salesSetCookie.split(';')[0];

  // Log in as seeded inv_manager demo user (inventory_manager role)
  const invRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'inv_manager', password: 'demo1234' }),
  });
  expect(invRes.status).toBe(200);
  const invSetCookie = invRes.headers.get('set-cookie') ?? '';
  inventoryManagerCookie = invSetCookie.split(';')[0];
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Authorization tests
// ---------------------------------------------------------------------------

test('GET /api/inventory — unauthenticated returns 401', async () => {
  const res = await fetch(`${BASE}/api/inventory`);
  expect(res.status).toBe(401);
});

test('GET /api/inventory — sales_rep gets 403', async () => {
  const res = await fetch(`${BASE}/api/inventory`, {
    headers: { Cookie: salesRepCookie },
  });
  expect(res.status).toBe(403);
});

// ---------------------------------------------------------------------------
// Functional tests
// ---------------------------------------------------------------------------

test('GET /api/inventory — inventory_manager returns all 5 seeded products', async () => {
  const res = await fetch(`${BASE}/api/inventory`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBe(5);
});

test('GET /api/inventory — each entry has product_id, product_sku, product_name', async () => {
  const res = await fetch(`${BASE}/api/inventory`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);

  const body: Array<{
    product_id: string;
    product_sku: string;
    product_name: string;
    position: StockPosition;
  }> = await res.json();

  for (const entry of body) {
    expect(typeof entry.product_id).toBe('string');
    expect(entry.product_id).not.toBe('');
    expect(typeof entry.product_sku).toBe('string');
    expect(entry.product_sku).not.toBe('');
    expect(typeof entry.product_name).toBe('string');
    expect(entry.product_name).not.toBe('');
  }
});

test('GET /api/inventory — each entry has a valid StockPosition', async () => {
  const res = await fetch(`${BASE}/api/inventory`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);

  const body: Array<{
    product_id: string;
    product_sku: string;
    product_name: string;
    position: StockPosition;
  }> = await res.json();

  for (const entry of body) {
    const p = entry.position;
    expect(typeof p.qty_on_hand).toBe('number');
    expect(typeof p.committed_qty).toBe('number');
    expect(typeof p.pending_qty).toBe('number');
    expect(typeof p.net_available).toBe('number');
    expect(typeof p.effective_available).toBe('number');
    expect(['healthy', 'warning', 'critical']).toContain(p.status);
    expect(typeof p.reorder_point).toBe('number');
    expect(typeof p.safety_stock).toBe('number');
    expect(typeof p.reorder_qty).toBe('number');
    expect(typeof p.lead_time_days).toBe('number');
  }
});

test('GET /api/inventory — includes all 5 seeded product SKUs', async () => {
  const res = await fetch(`${BASE}/api/inventory`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);

  const body: Array<{ product_sku: string }> = await res.json();
  const skus = body.map((e) => e.product_sku);

  expect(skus).toContain('WM-4X4-10GA');
  expect(skus).toContain('WM-4X4-10GA-36X96');
  expect(skus).toContain('WM-4X4-10GA-60X120');
  expect(skus).toContain('WM-4X4-10GA-48X240');
  expect(skus).toContain('WM-4X4-10GA-60X240');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForServer(base: string): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/auth/me`);
      if (res.status !== 0) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not become ready in time');
}
