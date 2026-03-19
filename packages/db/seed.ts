import postgres from 'postgres';

/**
 * Demo seed data for MeshMargin.
 *
 * Idempotent: checks whether demo data already exists before inserting.
 * Safe to call on every server startup.
 */

const WIRE_MESH_SKU = 'WM-4X4-10GA';
const DEMO_USERS = [
  { username: 'sales_rep', password: 'demo1234' },
  { username: 'order_clerk', password: 'demo1234' },
] as const;

export interface SeedOptions {
  databaseUrl?: string;
}

export async function seed(sqlConn: postgres.Sql, options: SeedOptions = {}): Promise<void> {
  const db =
    options.databaseUrl !== undefined
      ? postgres(options.databaseUrl, {
          max: 1,
          idle_timeout: 10,
          connect_timeout: 10,
          connection: { client_min_messages: 'warning' },
        })
      : sqlConn;

  try {
    await seedProduct(db);
    await seedUsers(db);
    console.log('[seed] Demo seed complete.');
  } finally {
    if (db !== sqlConn) {
      await db.end({ timeout: 5 });
    }
  }
}

async function seedProduct(db: postgres.Sql): Promise<void> {
  const existing = await db`
    SELECT id FROM entities
    WHERE type = 'product' AND properties->>'sku' = ${WIRE_MESH_SKU}
  `;

  if (existing.length > 0) {
    console.log('[seed] Wire Mesh product already exists, skipping.');
    return;
  }

  const id = crypto.randomUUID();
  const properties = {
    name: '4x4 Welded Wire Mesh - 10ga',
    sku: WIRE_MESH_SKU,
    material: 'Galvanized Steel',
    width_inches: 48,
    length_inches: 120,
    weight_per_sqft: 0.58,
    cost_per_each: 32.0,
    cost_per_linft: null,
    cost_per_sqft: null,
    primary_cost_basis: 'each',
    margin_target: 25,
    margin_floor: 15,
  };

  await db`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (${id}, 'product', ${db.json(properties)}, null)
  `;

  console.log('[seed] Inserted Wire Mesh product.');
}

async function seedUsers(db: postgres.Sql): Promise<void> {
  for (const { username, password } of DEMO_USERS) {
    const existing = await db`
      SELECT id FROM entities
      WHERE type = 'user' AND properties->>'username' = ${username}
    `;

    if (existing.length > 0) {
      console.log(`[seed] User "${username}" already exists, skipping.`);
      continue;
    }

    const id = crypto.randomUUID();
    const hash = await Bun.password.hash(password);
    const properties = {
      username,
      password_hash: hash,
    };

    await db`
      INSERT INTO entities (id, type, properties, tenant_id)
      VALUES (${id}, 'user', ${db.json(properties)}, null)
    `;

    console.log(`[seed] Inserted demo user "${username}".`);
  }
}
