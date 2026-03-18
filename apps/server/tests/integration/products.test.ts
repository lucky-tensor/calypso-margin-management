import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

const PORT = 31417;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let authCookie = '';

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
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
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

test('GET /api/products returns 200 with empty array initially', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    headers: { Cookie: authCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test('POST /api/products with valid data returns 201 with created product', async () => {
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
      sku: 'TPD-001',
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

test('GET /api/products returns created product in the list', async () => {
  // Create a product
  const createRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Listed Product',
      sku: 'LP-001',
      width_inches: 36,
      length_inches: 72,
      cost_per_each: 20.0,
      primary_cost_basis: 'each',
    }),
  });
  expect(createRes.status).toBe(201);
  const created = await createRes.json();

  // List products
  const listRes = await fetch(`${BASE}/api/products`, {
    headers: { Cookie: authCookie },
  });
  expect(listRes.status).toBe(200);
  const products = await listRes.json();
  const found = products.find((p: { id: string }) => p.id === created.id);
  expect(found).toBeTruthy();
});

test('POST /api/products with missing name returns 400', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      sku: 'NONAME-001',
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

test('POST /api/products with missing sku returns 400', async () => {
  const res = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'No SKU Product',
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
      name: 'Mismatched Cost',
      sku: 'MC-001',
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
      name: 'Zero Width',
      sku: 'ZW-001',
      width_inches: 0,
      length_inches: 120,
      cost_per_each: 10,
      primary_cost_basis: 'each',
    }),
  });
  expect(res.status).toBe(400);
});

test('PATCH /api/products/:id updates only supplied fields', async () => {
  // Create product first
  const createRes = await fetch(`${BASE}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({
      name: 'Original Name',
      sku: 'ORIG-001',
      width_inches: 48,
      length_inches: 120,
      cost_per_each: 30.0,
      primary_cost_basis: 'each',
    }),
  });
  expect(createRes.status).toBe(201);
  const created = await createRes.json();

  // Patch only the name
  const patchRes = await fetch(`${BASE}/api/products/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ name: 'Updated Name' }),
  });
  expect(patchRes.status).toBe(200);
  const updated = await patchRes.json();
  expect(updated.properties.name).toBe('Updated Name');
  // Other fields preserved
  expect(updated.properties.sku).toBe('ORIG-001');
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
