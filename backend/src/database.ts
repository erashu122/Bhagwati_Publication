import { migrateAuthorPortrait, migrateCatalog, migrateReadingPreviews } from './catalog-migration.ts';
import { databaseErrorCode, openEmbeddedDatabase, openPostgresDatabase } from './database-driver.ts';
import type { DatabaseExecutor } from './database-driver.ts';

export async function initializeSchema(tx: DatabaseExecutor, seed = true) {
  await tx.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password TEXT NOT NULL,
      address JSONB,
      operator BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS admin_recovery (
      singleton BOOLEAN PRIMARY KEY CHECK (singleton),
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      customer_id UUID NOT NULL REFERENCES customers(id),
      request_key UUID NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'confirmed', 'shipped', 'completed', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lines JSONB NOT NULL,
      subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
      address JSONB,
      UNIQUE (customer_id, request_key)
    );
    CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS enquiries (
      id UUID PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await migrateCatalog(tx, seed);
  await migrateAuthorPortrait(tx, seed);
  await migrateReadingPreviews(tx, seed);
}

export async function lockPostgresSchema(tx: DatabaseExecutor) {
  await tx.query('SELECT pg_advisory_xact_lock(239013, 51628)');
}

export async function openDatabase() {
  const onVercel = process.env.VERCEL === '1';
  const neonUrl = onVercel ? process.env.NEON_DATABASE_URL?.trim() : undefined;
  const url = neonUrl || process.env.DATABASE_URL?.trim();
  if (onVercel && !url) {
    throw new Error('Set NEON_DATABASE_URL or DATABASE_URL in the Vercel project environment to start the store API.');
  }
  const db = url ? openPostgresDatabase(url) : await openEmbeddedDatabase();
  try {
    await db.transaction(async tx => {
      if (url) await lockPostgresSchema(tx);
      await initializeSchema(tx);
    });
    return db;
  } catch (error) {
    await db.close().catch(() => {});
    if (!url) throw error;
    const variable = neonUrl ? 'NEON_DATABASE_URL' : 'DATABASE_URL';
    throw new Error('Could not open the PostgreSQL store. Check ' + variable + ' and database permissions (' + databaseErrorCode(error) + ').');
  }
}
