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
    ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS email_status TEXT;
    CREATE TABLE IF NOT EXISTS enquiry_settings (
      singleton BOOLEAN PRIMARY KEY CHECK (singleton),
      recipient TEXT NOT NULL
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
  const { rows } = await tx.query("INSERT INTO store_migrations (name) VALUES ('commerce-v1') ON CONFLICT DO NOTHING RETURNING name");
  if (!rows.length) return;
  await tx.exec(`
    ALTER TABLE books DROP CONSTRAINT books_format_check;
    ALTER TABLE books ADD CHECK (format IN ('eBook', 'Paperback', 'Hardcover', 'Bundle'));
    ALTER TABLE books ADD COLUMN component_ids TEXT[];
    ALTER TABLE orders ADD COLUMN final_total INTEGER CHECK (final_total BETWEEN 0 AND 1000000);
    ALTER TABLE orders ADD COLUMN paid_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN payment_link_id TEXT UNIQUE;
    ALTER TABLE orders ADD COLUMN payment_attempt SMALLINT CHECK (payment_attempt BETWEEN 1 AND 9999);
    ALTER TABLE orders ADD COLUMN payment_id TEXT UNIQUE;
    ALTER TABLE orders ADD COLUMN refunded_at TIMESTAMPTZ;
    ALTER TABLE enquiries ADD COLUMN bulk_details JSONB;
    CREATE TABLE ebook_files (
      book_id TEXT PRIMARY KEY REFERENCES books(id),
      bytes BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 8 AND 4000000)
    );
    CREATE TABLE book_reviews (
      id UUID PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id),
      customer_id UUID NOT NULL REFERENCES customers(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (book_id, customer_id)
    );
    CREATE VIEW paid_books AS
      SELECT o.customer_id, item->>'id' AS book_id, item->>'format' AS format, item->>'title' AS title
        FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.lines) AS line
        CROSS JOIN LATERAL jsonb_array_elements(jsonb_build_array(line) || COALESCE(line->'components', '[]'::jsonb)) AS item
       WHERE o.paid_at IS NOT NULL AND o.status <> 'cancelled';
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
