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
  await tx.exec(`
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS upi_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= subtotal);
    CREATE TABLE IF NOT EXISTS wishlist (
      id UUID PRIMARY KEY,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (customer_id, book_id)
    );
    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
      order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS notifications_customer_idx ON notifications(customer_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS notification_reads (
      id UUID PRIMARY KEY,
      notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      UNIQUE (customer_id, notification_id)
    );
  `);
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
