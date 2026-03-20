import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

/**
 * Integration tests for user management endpoints (Issue #70).
 *
 * Verifies:
 * - GET /api/users returns user list without password_hash (admin only)
 * - GET /api/users returns 403 for non-admin
 * - PATCH /api/users/:id can change role (admin only)
 * - PATCH /api/users/:id returns 403 for non-admin
 * - Invalid role values return 400
 */

const PORT = 31421;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let adminCookie = '';
let salesRepCookie = '';
let salesRepId = '';
let adminId = '';

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
  const salesRepUsername = `sales_rep_${Date.now()}`;
  const salesRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: salesRepUsername, password: 'testpass123' }),
  });
  expect(salesRes.status).toBe(201);
  const salesSetCookie = salesRes.headers.get('set-cookie') ?? '';
  salesRepCookie = salesSetCookie.split(';')[0];
  const salesBody = await salesRes.json();
  salesRepId = salesBody.user.id;

  // Insert an admin user directly into the database
  const sql = postgres(pg.url, { max: 1 });
  const adminUsername = `admin_${Date.now()}`;
  adminId = crypto.randomUUID();
  const adminHash = await Bun.password.hash('adminpass123');
  await sql`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (
      ${adminId},
      'user',
      ${sql.json({ username: adminUsername, password_hash: adminHash, role: 'admin', display_name: 'Test Admin' })},
      null
    )
  `;
  await sql.end();

  // Log in as the admin
  const adminRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: 'adminpass123' }),
  });
  expect(adminRes.status).toBe(200);
  const adminSetCookie = adminRes.headers.get('set-cookie') ?? '';
  adminCookie = adminSetCookie.split(';')[0];
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// GET /api/users tests
// ---------------------------------------------------------------------------

test('GET /api/users returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/users`);
  expect(res.status).toBe(401);
});

test('GET /api/users returns 403 for sales_rep', async () => {
  const res = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: salesRepCookie },
  });
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toBe('Forbidden');
});

test('GET /api/users returns 200 with user list for admin', async () => {
  const res = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: adminCookie },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
});

test('GET /api/users returns users without password_hash', async () => {
  const res = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: adminCookie },
  });
  expect(res.status).toBe(200);
  const users = await res.json();
  for (const user of users) {
    expect(user).not.toHaveProperty('password_hash');
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('display_name');
  }
});

test('GET /api/users response includes the registered sales_rep user', async () => {
  const res = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: adminCookie },
  });
  expect(res.status).toBe(200);
  const users = await res.json();
  const found = users.find((u: { id: string }) => u.id === salesRepId);
  expect(found).toBeTruthy();
  expect(found.role).toBe('sales_rep');
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id tests
// ---------------------------------------------------------------------------

test('PATCH /api/users/:id returns 401 without session', async () => {
  const res = await fetch(`${BASE}/api/users/${salesRepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'inventory_manager' }),
  });
  expect(res.status).toBe(401);
});

test('PATCH /api/users/:id returns 403 for sales_rep', async () => {
  const res = await fetch(`${BASE}/api/users/${salesRepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: salesRepCookie },
    body: JSON.stringify({ role: 'inventory_manager' }),
  });
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toBe('Forbidden');
});

test('PATCH /api/users/:id can change role (admin)', async () => {
  const res = await fetch(`${BASE}/api/users/${salesRepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ role: 'inventory_manager' }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.id).toBe(salesRepId);
  expect(body.role).toBe('inventory_manager');

  // Verify via GET /api/users
  const listRes = await fetch(`${BASE}/api/users`, {
    headers: { Cookie: adminCookie },
  });
  const users = await listRes.json();
  const updated = users.find((u: { id: string }) => u.id === salesRepId);
  expect(updated.role).toBe('inventory_manager');
});

test('PATCH /api/users/:id can update display_name (admin)', async () => {
  const res = await fetch(`${BASE}/api/users/${salesRepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ display_name: 'Updated Name' }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.display_name).toBe('Updated Name');
});

test('PATCH /api/users/:id returns 400 for invalid role', async () => {
  const res = await fetch(`${BASE}/api/users/${salesRepId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ role: 'superuser' }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('PATCH /api/users/:id returns 404 for nonexistent user', async () => {
  const res = await fetch(`${BASE}/api/users/nonexistent-user-id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ role: 'sales_rep' }),
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
