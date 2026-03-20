import postgres from 'postgres';

/**
 * Demo seed data for MeshMargin.
 *
 * Idempotent: checks whether demo data already exists before inserting.
 * Safe to call on every server startup.
 */

const WIRE_MESH_PRODUCTS = [
  {
    sku: 'WM-4X4-10GA',
    name: '4x4 Welded Wire Mesh - 10ga',
    width_inches: 48,
    length_inches: 120,
    cost_per_each: 32.0,
    qty_on_hand_eaches: 150,
    safety_stock_eaches: 25,
    reorder_point_eaches: 100,
    reorder_qty_eaches: 200,
    lead_time_days: 14,
  },
  {
    sku: 'WM-4X4-10GA-36X96',
    name: '4x4 Welded Wire Mesh - 10ga 36"×96"',
    width_inches: 36,
    length_inches: 96,
    cost_per_each: 19.2,
    qty_on_hand_eaches: 80,
    safety_stock_eaches: 15,
    reorder_point_eaches: 50,
    reorder_qty_eaches: 100,
    lead_time_days: 14,
  },
  {
    sku: 'WM-4X4-10GA-60X120',
    name: '4x4 Welded Wire Mesh - 10ga 60"×120"',
    width_inches: 60,
    length_inches: 120,
    cost_per_each: 40.0,
    qty_on_hand_eaches: 12,
    safety_stock_eaches: 10,
    reorder_point_eaches: 40,
    reorder_qty_eaches: 80,
    lead_time_days: 21,
  },
  {
    sku: 'WM-4X4-10GA-48X240',
    name: '4x4 Welded Wire Mesh - 10ga 48"×240"',
    width_inches: 48,
    length_inches: 240,
    cost_per_each: 64.0,
    qty_on_hand_eaches: 200,
    safety_stock_eaches: 30,
    reorder_point_eaches: 80,
    reorder_qty_eaches: 150,
    lead_time_days: 14,
  },
  {
    sku: 'WM-4X4-10GA-60X240',
    name: '4x4 Welded Wire Mesh - 10ga 60"×240"',
    width_inches: 60,
    length_inches: 240,
    cost_per_each: 80.0,
    qty_on_hand_eaches: 45,
    safety_stock_eaches: 20,
    reorder_point_eaches: 60,
    reorder_qty_eaches: 120,
    lead_time_days: 21,
  },
] as const;

const DEMO_USERS = [
  {
    username: 'sales_rep',
    password: 'demo1234',
    role: 'sales_rep',
    display_name: 'Demo Sales Rep',
  },
  {
    username: 'order_clerk',
    password: 'demo1234',
    role: 'sales_rep',
    display_name: 'Demo Order Clerk',
  },
  {
    username: 'inv_manager',
    password: 'demo1234',
    role: 'inventory_manager',
    display_name: 'Demo Inventory Mgr',
  },
  { username: 'admin', password: 'demo1234', role: 'admin', display_name: 'Demo Admin' },
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
  for (const product of WIRE_MESH_PRODUCTS) {
    const existing = await db`
      SELECT id FROM entities
      WHERE type = 'product' AND properties->>'sku' = ${product.sku}
    `;

    let productId: string;

    if (existing.length > 0) {
      console.log(`[seed] Product "${product.sku}" already exists, skipping.`);
      productId = existing[0].id as string;
    } else {
      productId = crypto.randomUUID();
      const properties = {
        name: product.name,
        sku: product.sku,
        material: 'Galvanized Steel',
        width_inches: product.width_inches,
        length_inches: product.length_inches,
        weight_per_sqft: 0.58,
        cost_per_each: product.cost_per_each,
        cost_per_linft: null,
        cost_per_sqft: null,
        primary_cost_basis: 'each',
        margin_target: 25,
        margin_floor: 15,
        qty_on_hand_eaches: product.qty_on_hand_eaches,
        safety_stock_eaches: product.safety_stock_eaches,
        reorder_point_eaches: product.reorder_point_eaches,
        reorder_qty_eaches: product.reorder_qty_eaches,
        lead_time_days: product.lead_time_days,
        pending_order_weight: 0.7,
      };

      await db`
        INSERT INTO entities (id, type, properties, tenant_id)
        VALUES (${productId}, 'product', ${db.json(properties)}, null)
      `;

      console.log(`[seed] Inserted product "${product.sku}".`);
    }

    await seedInitialInventoryTxn(db, productId, product.sku, product.qty_on_hand_eaches);
  }
}

async function seedInitialInventoryTxn(
  db: postgres.Sql,
  productId: string,
  productSku: string,
  qtyOnHand: number,
): Promise<void> {
  const existing = await db`
    SELECT id FROM entities
    WHERE type = 'inventory_txn'
      AND properties->>'product_id' = ${productId}
      AND properties->>'txn_type' = 'initial'
  `;

  if (existing.length > 0) {
    console.log(`[seed] Initial inventory_txn for "${productSku}" already exists, skipping.`);
    return;
  }

  const txnId = crypto.randomUUID();
  const properties = {
    product_id: productId,
    product_sku: productSku,
    txn_type: 'initial',
    qty_eaches: qtyOnHand,
    reference: 'seed',
    balance_after: qtyOnHand,
    created_by: 'seed',
  };

  await db`
    INSERT INTO entities (id, type, properties, tenant_id)
    VALUES (${txnId}, 'inventory_txn', ${db.json(properties)}, null)
  `;

  console.log(`[seed] Inserted initial inventory_txn for "${productSku}" (qty=${qtyOnHand}).`);
}

async function seedUsers(db: postgres.Sql): Promise<void> {
  for (const { username, password, role, display_name } of DEMO_USERS) {
    const existing = await db`
      SELECT id, properties FROM entities
      WHERE type = 'user' AND properties->>'username' = ${username}
    `;

    if (existing.length > 0) {
      const user = existing[0];
      const props = user.properties as Record<string, unknown>;
      if (props.role === undefined || props.display_name === undefined) {
        await db`
          UPDATE entities
          SET properties = properties || ${db.json({ role, display_name })}
          WHERE id = ${user.id}
        `;
        console.log(`[seed] Updated demo user "${username}" with role and display_name.`);
      } else {
        console.log(`[seed] User "${username}" already exists, skipping.`);
      }
      continue;
    }

    const id = crypto.randomUUID();
    const hash = await Bun.password.hash(password);
    const properties = {
      username,
      password_hash: hash,
      role,
      display_name,
    };

    await db`
      INSERT INTO entities (id, type, properties, tenant_id)
      VALUES (${id}, 'user', ${db.json(properties)}, null)
    `;

    console.log(`[seed] Inserted demo user "${username}".`);
  }
}
