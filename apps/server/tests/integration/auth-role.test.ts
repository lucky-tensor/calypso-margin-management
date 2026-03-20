import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

/**
 * Integration tests for JWT role payload and requireRole() middleware.
 *
 * Verifies:
 * - Login response JWT contains the role field
 * - Register response JWT contains the role field
 * - getAuthenticatedUser returns { id, username, role }
 * - requireRole blocks unauthorized roles with 403
 * - requireRole allows authorized roles
 */

const PORT = 31420;
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
    env: { ...process.env, DATABASE_URL: pg.url, PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await waitForServer(BASE);

  // Register a sales_rep user via the API (default role)
  const salesRepUsername = `sales_rep_test_${Date.now()}`;
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
  const invMgrUsername = `inv_mgr_test_${Date.now()}`;
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
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// JWT role tests
// ---------------------------------------------------------------------------

test('POST /api/auth/register response includes role field for new user', async () => {
  const username = `role_test_${Date.now()}`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'testpass123' }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.user.role).toBe('sales_rep');
});

test('POST /api/auth/login response includes role field', async () => {
  // Register then login
  const username = `login_role_test_${Date.now()}`;
  await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'testpass123' }),
  });

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'testpass123' }),
  });
  expect(loginRes.status).toBe(200);
  const body = await loginRes.json();
  expect(body.user.role).toBe('sales_rep');
});

test('GET /api/auth/me returns role in user payload for sales_rep', async () => {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: salesRepCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.user.id).toBeTruthy();
  expect(body.user.username).toBeTruthy();
  expect(body.user.role).toBe('sales_rep');
});

test('GET /api/auth/me returns role in user payload for inventory_manager', async () => {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: inventoryManagerCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.user.id).toBeTruthy();
  expect(body.user.username).toBeTruthy();
  expect(body.user.role).toBe('inventory_manager');
});

// ---------------------------------------------------------------------------
// requireRole tests — tested via the requireRole unit test helper
// ---------------------------------------------------------------------------

test('requireRole blocks sales_rep from inventory_manager-only action', async () => {
  // The requireRole function is tested here by importing and calling it directly.
  // We construct a mock Request with the sales_rep session cookie.
  const { requireRole } = await import('../../src/api/auth');

  const mockReq = new Request(`${BASE}/api/test`, {
    headers: { Cookie: salesRepCookie },
  });

  const guard = requireRole('inventory_manager');
  const res = await guard(mockReq);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(403);
  const body = await res!.json();
  expect(body.error).toBe('Forbidden');
  expect(body.message).toBe('This action requires the inventory_manager role.');
  expect(body.required_role).toBe('inventory_manager');
  expect(body.current_role).toBe('sales_rep');
});

test('requireRole allows inventory_manager for inventory_manager-only action', async () => {
  const { requireRole } = await import('../../src/api/auth');

  const mockReq = new Request(`${BASE}/api/test`, {
    headers: { Cookie: inventoryManagerCookie },
  });

  const guard = requireRole('inventory_manager');
  const res = await guard(mockReq);

  expect(res).toBeNull();
});

test('requireRole allows all roles when all are listed', async () => {
  const { requireRole } = await import('../../src/api/auth');

  const salesReq = new Request(`${BASE}/api/test`, {
    headers: { Cookie: salesRepCookie },
  });
  const invMgrReq = new Request(`${BASE}/api/test`, {
    headers: { Cookie: inventoryManagerCookie },
  });

  const guard = requireRole('sales_rep', 'inventory_manager', 'admin');

  const salesRes = await guard(salesReq);
  const invMgrRes = await guard(invMgrReq);

  expect(salesRes).toBeNull();
  expect(invMgrRes).toBeNull();
});

test('requireRole returns 401 for unauthenticated request', async () => {
  const { requireRole } = await import('../../src/api/auth');

  const mockReq = new Request(`${BASE}/api/test`);
  const guard = requireRole('inventory_manager');
  const res = await guard(mockReq);

  expect(res).not.toBeNull();
  expect(res!.status).toBe(401);
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
