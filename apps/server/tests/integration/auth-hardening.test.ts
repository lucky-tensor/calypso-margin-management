import { test, expect, beforeAll, afterAll } from 'vitest';
import type { Subprocess } from 'bun';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from '../helpers/pg-container';

/**
 * Integration tests for authentication hardening (issue #129).
 *
 * Verifies:
 * - Expired JWT cookie returns 401 from GET /api/auth/me
 * - JWT signed with wrong secret returns 401 from GET /api/auth/me
 * - Role change via PATCH /api/users/:id is reflected in the next GET /api/auth/me without logout
 * - POST /api/auth/logout Set-Cookie includes SameSite=Lax and Max-Age=0
 * - NODE_ENV=production causes login Set-Cookie to include the Secure attribute
 * - CORS: unlisted origin does not receive Access-Control-Allow-Origin header
 * - CORS: listed origin receives Access-Control-Allow-Origin header
 */

const PORT = 31423;
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 20_000;
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';

let pg: PgContainer;
let server: Subprocess;
let adminCookie = '';
let adminUserId = '';
let targetUserId = '';
let targetUserCookie = '';

beforeAll(async () => {
  pg = await startPostgres();

  server = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: pg.url,
      PORT: String(PORT),
      JWT_SECRET: 'test-secret-for-auth-hardening',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5174,https://allowed.example.com',
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  await waitForServer(BASE);

  // Insert an admin user directly into the DB
  const sql = postgres(pg.url, { max: 1 });
  adminUserId = crypto.randomUUID();
  const adminHash = await Bun.password.hash('testpass123');
  const adminUsername = `admin_hardening_${Date.now()}`;
  await sql`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (
      ${adminUserId},
      'user',
      ${sql.json({ username: adminUsername, password_hash: adminHash, role: 'admin', display_name: 'Admin User' })},
      null
    )
  `;

  // Insert a sales_rep user that will be promoted during tests
  targetUserId = crypto.randomUUID();
  const targetHash = await Bun.password.hash('testpass123');
  const targetUsername = `target_user_${Date.now()}`;
  await sql`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (
      ${targetUserId},
      'user',
      ${sql.json({ username: targetUsername, password_hash: targetHash, role: 'sales_rep', display_name: 'Target User' })},
      null
    )
  `;
  await sql.end();

  // Log in as admin
  const adminRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: 'testpass123' }),
  });
  expect(adminRes.status).toBe(200);
  adminCookie = (adminRes.headers.get('set-cookie') ?? '').split(';')[0];

  // Log in as the target user (sales_rep)
  const targetRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: targetUsername, password: 'testpass123' }),
  });
  expect(targetRes.status).toBe(200);
  targetUserCookie = (targetRes.headers.get('set-cookie') ?? '').split(';')[0];
}, 60_000);

afterAll(async () => {
  server?.kill();
  await pg?.stop();
});

// ---------------------------------------------------------------------------
// Expired and forged token tests
// ---------------------------------------------------------------------------

test('GET /api/auth/me returns 401 for an expired JWT', async () => {
  // Build a JWT whose exp is 1 second in the past using the correct secret
  const expiredToken = await buildJwt(
    { id: 'fake-user', username: 'expired', role: 'sales_rep', display_name: 'Expired' },
    'test-secret-for-auth-hardening',
    -1, // exp = now - 1 second → already expired
  );

  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: `meshmargin_auth=${expiredToken}` },
  });
  expect(res.status).toBe(401);
});

test('GET /api/auth/me returns 401 for a JWT signed with the wrong secret', async () => {
  const forgedToken = await buildJwt(
    { id: 'fake-user', username: 'forged', role: 'admin', display_name: 'Forged' },
    'wrong-secret',
    3600,
  );

  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: `meshmargin_auth=${forgedToken}` },
  });
  expect(res.status).toBe(401);
});

// ---------------------------------------------------------------------------
// Role change reflection test
// ---------------------------------------------------------------------------

test('GET /api/auth/me reflects updated role after PATCH /api/users/:id without logout', async () => {
  // The target user is currently sales_rep. Verify that before the role change.
  const beforeRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: targetUserCookie },
  });
  expect(beforeRes.status).toBe(200);
  const beforeBody = await beforeRes.json();
  expect(beforeBody.user.role).toBe('sales_rep');

  // Admin promotes the target user to inventory_manager
  const patchRes = await fetch(`${BASE}/api/users/${targetUserId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({ role: 'inventory_manager' }),
  });
  expect(patchRes.status).toBe(200);

  // The target user calls /api/auth/me with the ORIGINAL cookie (still sales_rep JWT)
  // The server should re-fetch from DB and return the new role.
  const afterRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: targetUserCookie },
  });
  expect(afterRes.status).toBe(200);
  const afterBody = await afterRes.json();
  expect(afterBody.user.role).toBe('inventory_manager');

  // A fresh Set-Cookie should be present because the role changed
  const freshCookie = afterRes.headers.get('set-cookie');
  expect(freshCookie).not.toBeNull();
  expect(freshCookie).toContain('meshmargin_auth=');
});

// ---------------------------------------------------------------------------
// Logout cookie test
// ---------------------------------------------------------------------------

test('POST /api/auth/logout Set-Cookie includes SameSite=Lax and Max-Age=0', async () => {
  const res = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  expect(setCookie.toLowerCase()).toContain('samesite=lax');
  expect(setCookie.toLowerCase()).toContain('max-age=0');
});

// ---------------------------------------------------------------------------
// Production Secure attribute test
// ---------------------------------------------------------------------------

test('POST /api/auth/login Set-Cookie includes Secure when NODE_ENV=production', async () => {
  // Spawn a separate server instance with NODE_ENV=production
  const prodPort = PORT + 1;
  const prodBase = `http://localhost:${prodPort}`;

  const prodServer = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: pg.url,
      PORT: String(prodPort),
      JWT_SECRET: 'test-secret-for-auth-hardening',
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5174',
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  try {
    await waitForServer(prodBase);

    // Register a user via the production server
    const username = `prod_secure_test_${Date.now()}`;
    const regRes = await fetch(`${prodBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'testpass123' }),
    });
    expect(regRes.status).toBe(201);
    const regCookie = regRes.headers.get('set-cookie') ?? '';
    expect(regCookie.toLowerCase()).toContain('secure');
    expect(regCookie.toLowerCase()).toContain('samesite=lax');

    // Login via the production server
    const loginRes = await fetch(`${prodBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'testpass123' }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookie = loginRes.headers.get('set-cookie') ?? '';
    expect(loginCookie.toLowerCase()).toContain('secure');
    expect(loginCookie.toLowerCase()).toContain('samesite=lax');
  } finally {
    prodServer.kill();
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Server startup without JWT_SECRET
// ---------------------------------------------------------------------------

test('server exits with non-zero code when JWT_SECRET is not set in production', async () => {
  const noSecretPort = PORT + 2;

  const proc = Bun.spawn(['bun', 'run', SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: pg.url,
      PORT: String(noSecretPort),
      NODE_ENV: 'production',
      // Explicitly remove JWT_SECRET
      JWT_SECRET: '',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  expect(exitCode).not.toBe(0);
}, 30_000);

// ---------------------------------------------------------------------------
// CORS allowlist tests
// ---------------------------------------------------------------------------

test('CORS: listed origin receives Access-Control-Allow-Origin header', async () => {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: {
      Cookie: adminCookie,
      Origin: 'http://localhost:5174',
    },
  });
  expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');
});

test('CORS: unlisted origin does not receive Access-Control-Allow-Origin header', async () => {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: {
      Cookie: adminCookie,
      Origin: 'http://evil.example.com',
    },
  });
  expect(res.headers.get('access-control-allow-origin')).toBeNull();
});

// ---------------------------------------------------------------------------
// Helpers
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

/**
 * Build a compact JWT using Web Crypto (HS256) for test purposes.
 * expOffsetSeconds: positive = future, negative = past.
 */
async function buildJwt(
  payload: Record<string, unknown>,
  secret: string,
  expOffsetSeconds: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds;
  const encodedPayload = btoa(JSON.stringify({ ...payload, exp }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const data = encoder.encode(`${header}.${encodedPayload}`);
  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${header}.${encodedPayload}.${sig}`;
}
