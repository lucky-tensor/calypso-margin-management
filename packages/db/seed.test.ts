import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from './pg-container';
import { migrate, seed } from './index';

/**
 * Integration tests for demo seed users with roles.
 *
 * Verifies:
 * - 4 demo users seeded with correct roles and display names
 * - Seed is idempotent (no duplicates on second run)
 */

let pg: PgContainer;
let db: postgres.Sql;

beforeAll(async () => {
  pg = await startPostgres();
  db = postgres(pg.url, { max: 1 });
  await migrate({ databaseUrl: pg.url });
  await seed(db);
}, 60_000);

afterAll(async () => {
  await db?.end({ timeout: 5 });
  await pg?.stop();
});

const EXPECTED_USERS = [
  { username: 'sales_rep', role: 'sales_rep', display_name: 'Demo Sales Rep' },
  { username: 'order_clerk', role: 'sales_rep', display_name: 'Demo Order Clerk' },
  { username: 'inv_manager', role: 'inventory_manager', display_name: 'Demo Inventory Mgr' },
  { username: 'admin', role: 'admin', display_name: 'Demo Admin' },
];

describe('seed users with roles', () => {
  test('4 demo users exist after seed with correct roles', async () => {
    const rows = await db`
      SELECT properties->>'username' as username,
             properties->>'role' as role,
             properties->>'display_name' as display_name
      FROM entities
      WHERE type = 'user'
        AND properties->>'username' IN ('sales_rep', 'order_clerk', 'inv_manager', 'admin')
      ORDER BY properties->>'username'
    `;

    expect(rows).toHaveLength(4);

    for (const expected of EXPECTED_USERS) {
      const row = rows.find((r: { username: string }) => r.username === expected.username);
      expect(row, `user "${expected.username}" should exist`).toBeTruthy();
      expect(row?.role).toBe(expected.role);
      expect(row?.display_name).toBe(expected.display_name);
    }
  });

  test('seed is idempotent — running seed twice produces no duplicates', async () => {
    await seed(db);

    const rows = await db`
      SELECT properties->>'username' as username
      FROM entities
      WHERE type = 'user'
        AND properties->>'username' IN ('sales_rep', 'order_clerk', 'inv_manager', 'admin')
    `;

    expect(rows).toHaveLength(4);
  });
});
