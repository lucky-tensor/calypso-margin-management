import postgres from 'postgres';
import { join } from 'path';
import { readFileSync } from 'fs';

export { seed } from './seed';
export type { SeedOptions } from './seed';

// Connection pool for MeshMargin.
function maskDbUrl(dbUrl: string): string {
  return dbUrl.replace(/:[^:@]+@/, ':***@');
}

function getDbUrl(): string {
  const dbUrl =
    process.env.DATABASE_URL || 'postgres://app_rw:app_rw_password@localhost:5432/meshmargin_app';
  console.log(`[db] Binding to PostgreSQL at: ${maskDbUrl(dbUrl)}`);
  return dbUrl;
}

export const sql = postgres(getDbUrl(), {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  connection: { client_min_messages: 'warning' },
});

export interface MigrateOptions {
  databaseUrl?: string;
}

/**
 * Initializes the database tables by executing the native raw SQL schema.
 * This function should be called at server startup to ensure tables exist.
 *
 * Policy note:
 * This is a starter bootstrap migration path, not the final enterprise data
 * posture. Future work should separate graph schema setup from ledger / journal
 * migrations, audit-store setup, and digital-twin checkpoint infrastructure.
 */
export async function migrate(options: MigrateOptions = {}) {
  console.log('[db] Initializing PostgreSQL database schema...');
  const schemaSql = readFileSync(join(import.meta.dir, 'schema.sql'), 'utf-8');
  const databaseUrl = options.databaseUrl ?? getDbUrl();
  const migrationSql =
    options.databaseUrl === undefined
      ? sql
      : postgres(databaseUrl, {
          max: 1,
          idle_timeout: 10,
          connect_timeout: 10,
          connection: { client_min_messages: 'warning' },
        });

  try {
    // Remove comments and split by semicolon
    const cleanSql = schemaSql
      .replace(/--.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

    const statements = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Execute sequentially
    for (const statement of statements) {
      await migrationSql.unsafe(statement);
    }
    console.log('[db] Schema migration complete.');
  } catch (err) {
    console.error('[db] Schema migration failed:', err);
    throw err;
  } finally {
    if (migrationSql !== sql) {
      await migrationSql.end({ timeout: 5 });
    }
  }
}
