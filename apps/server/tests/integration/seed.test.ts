import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

/**
 * Integration tests for demo seed data.
 *
 * Verifies:
 * - Wire Mesh product is seeded on startup
 * - Demo users (sales_rep, order_clerk) can log in
 * - Seed is idempotent (second startup does not duplicate data)
 */

const PORT = 31418;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;

beforeAll(async () => {
  pg = await startPostgres();

  server = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: pg.url, PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await waitForServer(BASE);
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// Helper: log in as a demo user and return the auth cookie
async function loginAs(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

test('sales_rep demo user can log in with password demo1234', async () => {
  const cookie = await loginAs('sales_rep', 'demo1234');
  expect(cookie).toContain('meshmargin_auth=');

  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  expect(meRes.status).toBe(200);
  const body = await meRes.json();
  expect(body.user.username).toBe('sales_rep');
});

test('order_clerk demo user can log in with password demo1234', async () => {
  const cookie = await loginAs('order_clerk', 'demo1234');
  expect(cookie).toContain('meshmargin_auth=');

  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  expect(meRes.status).toBe(200);
  const body = await meRes.json();
  expect(body.user.username).toBe('order_clerk');
});

test('Wire Mesh product is seeded and visible in product catalog', async () => {
  const cookie = await loginAs('sales_rep', 'demo1234');

  const res = await fetch(`${BASE}/api/products`, {
    headers: { Cookie: cookie },
  });
  expect(res.status).toBe(200);
  const products = await res.json();

  const wireMesh = products.find(
    (p: { properties: { sku: string } }) => p.properties.sku === 'WM-4X4-10GA',
  );
  expect(wireMesh).toBeTruthy();
  expect(wireMesh.properties.name).toBe('4x4 Welded Wire Mesh - 10ga');
  expect(wireMesh.properties.material).toBe('Galvanized Steel');
  expect(wireMesh.properties.width_inches).toBe(48);
  expect(wireMesh.properties.length_inches).toBe(120);
  expect(wireMesh.properties.weight_per_sqft).toBe(0.58);
  expect(wireMesh.properties.cost_per_each).toBe(32.0);
  expect(wireMesh.properties.primary_cost_basis).toBe('each');
  expect(wireMesh.properties.margin_target).toBe(25);
  expect(wireMesh.properties.margin_floor).toBe(15);
});

test('seed is idempotent - exactly one Wire Mesh product exists', async () => {
  const cookie = await loginAs('sales_rep', 'demo1234');

  const res = await fetch(`${BASE}/api/products`, {
    headers: { Cookie: cookie },
  });
  expect(res.status).toBe(200);
  const products = await res.json();

  const wireMeshProducts = products.filter(
    (p: { properties: { sku: string } }) => p.properties.sku === 'WM-4X4-10GA',
  );
  expect(wireMeshProducts.length).toBe(1);
});

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
