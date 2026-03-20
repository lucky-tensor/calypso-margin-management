import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';
import { startPostgres, type PgContainer } from './pg-container';
import { seed } from './seed';

/**
 * Integration tests for demo seed users with roles.
 *
 * Verifies:
 * - 4 demo users seeded with correct roles and display names
 * - Seed is idempotent (no duplicates on second run)
 */

const SCHEMA_PATH = join(new URL('.', import.meta.url).pathname, 'schema.sql');

let pg: PgContainer;
let db: postgres.Sql;

beforeAll(async () => {
  pg = await startPostgres();
  db = postgres(pg.url, { max: 1 });

  // Apply schema
  const schemaSql = readFileSync(SCHEMA_PATH, 'utf-8');
  const cleanSql = schemaSql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const statement of cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)) {
    await db.unsafe(statement);
  }

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

const EXPECTED_PRODUCTS = [
  {
    sku: 'WM-4X4-10GA',
    qty_on_hand_eaches: 150,
    safety_stock_eaches: 25,
    reorder_point_eaches: 100,
    reorder_qty_eaches: 200,
    lead_time_days: 14,
  },
  {
    sku: 'WM-4X4-10GA-36X96',
    qty_on_hand_eaches: 80,
    safety_stock_eaches: 15,
    reorder_point_eaches: 50,
    reorder_qty_eaches: 100,
    lead_time_days: 14,
  },
  {
    sku: 'WM-4X4-10GA-60X120',
    qty_on_hand_eaches: 12,
    safety_stock_eaches: 10,
    reorder_point_eaches: 40,
    reorder_qty_eaches: 80,
    lead_time_days: 21,
  },
  {
    sku: 'WM-4X4-10GA-48X240',
    qty_on_hand_eaches: 200,
    safety_stock_eaches: 30,
    reorder_point_eaches: 80,
    reorder_qty_eaches: 150,
    lead_time_days: 14,
  },
  {
    sku: 'WM-4X4-10GA-60X240',
    qty_on_hand_eaches: 45,
    safety_stock_eaches: 20,
    reorder_point_eaches: 60,
    reorder_qty_eaches: 120,
    lead_time_days: 21,
  },
] as const;

describe('seed inventory data', () => {
  test('all 5 products have inventory fields populated', async () => {
    const rows = await db`
      SELECT
        properties->>'sku' as sku,
        (properties->>'qty_on_hand_eaches')::int as qty_on_hand_eaches,
        (properties->>'safety_stock_eaches')::int as safety_stock_eaches,
        (properties->>'reorder_point_eaches')::int as reorder_point_eaches,
        (properties->>'reorder_qty_eaches')::int as reorder_qty_eaches,
        (properties->>'lead_time_days')::int as lead_time_days,
        (properties->>'pending_order_weight')::float as pending_order_weight
      FROM entities
      WHERE type = 'product'
        AND properties->>'sku' LIKE 'WM-%'
    `;

    expect(rows).toHaveLength(5);

    for (const expected of EXPECTED_PRODUCTS) {
      const row = rows.find((r: Record<string, unknown>) => r.sku === expected.sku);
      expect(row, `product "${expected.sku}" should exist`).toBeTruthy();
      expect(row?.qty_on_hand_eaches).toBe(expected.qty_on_hand_eaches);
      expect(row?.safety_stock_eaches).toBe(expected.safety_stock_eaches);
      expect(row?.reorder_point_eaches).toBe(expected.reorder_point_eaches);
      expect(row?.reorder_qty_eaches).toBe(expected.reorder_qty_eaches);
      expect(row?.lead_time_days).toBe(expected.lead_time_days);
      expect(row?.pending_order_weight).toBeCloseTo(0.7);
    }
  });

  test('each product has an initial inventory_txn with correct balance', async () => {
    for (const expected of EXPECTED_PRODUCTS) {
      const productRows = await db`
        SELECT id FROM entities
        WHERE type = 'product' AND properties->>'sku' = ${expected.sku}
      `;
      expect(productRows).toHaveLength(1);
      const productId = productRows[0].id as string;

      const txnRows = await db`
        SELECT
          properties->>'txn_type' as txn_type,
          (properties->>'qty_eaches')::int as qty_eaches,
          (properties->>'balance_after')::int as balance_after,
          properties->>'reference' as reference
        FROM entities
        WHERE type = 'inventory_txn'
          AND properties->>'product_id' = ${productId}
          AND properties->>'txn_type' = 'initial'
      `;

      expect(txnRows).toHaveLength(1);
      const txn = txnRows[0];
      expect(txn.txn_type).toBe('initial');
      expect(txn.qty_eaches).toBe(expected.qty_on_hand_eaches);
      expect(txn.balance_after).toBe(expected.qty_on_hand_eaches);
      expect(txn.reference).toBe('seed');
    }
  });

  test('WM-4X4-10GA-60X120 is near-critical — qty 12, safety 10', async () => {
    const rows = await db`
      SELECT
        (properties->>'qty_on_hand_eaches')::int as qty_on_hand_eaches,
        (properties->>'safety_stock_eaches')::int as safety_stock_eaches
      FROM entities
      WHERE type = 'product' AND properties->>'sku' = 'WM-4X4-10GA-60X120'
    `;
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.qty_on_hand_eaches).toBe(12);
    expect(row.safety_stock_eaches).toBe(10);
    // near-critical: qty - safety_stock = 2 (very small buffer)
    expect(row.qty_on_hand_eaches - row.safety_stock_eaches).toBe(2);
  });

  test('seed is idempotent — running seed twice produces no duplicate products or txns', async () => {
    await seed(db);

    const productRows = await db`
      SELECT properties->>'sku' as sku
      FROM entities
      WHERE type = 'product' AND properties->>'sku' LIKE 'WM-%'
    `;
    expect(productRows).toHaveLength(5);

    const txnRows = await db`
      SELECT id FROM entities
      WHERE type = 'inventory_txn' AND properties->>'txn_type' = 'initial'
    `;
    expect(txnRows).toHaveLength(5);
  });
});
