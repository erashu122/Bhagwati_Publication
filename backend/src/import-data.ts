import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeSchema, lockPostgresSchema } from './database.ts';
import { seedReadingPreviews } from './catalog-migration.ts';
import { databaseErrorCode, embeddedDirectory, openEmbeddedDatabase, openPostgresDatabase } from './database-driver.ts';
import type { DatabaseExecutor } from './database-driver.ts';

const tables = [
  { table: 'categories', key: 'id', type: 'integer', identity: 'id' },
  { table: 'books', key: 'id', type: 'text', identity: 'position' },
  { table: 'book_covers', key: 'book_id', type: 'text' },
  { table: 'store_content', key: 'singleton', type: 'boolean' },
  { table: 'author_portrait', key: 'singleton', type: 'boolean' },
  { table: 'customers', key: 'id', type: 'uuid' },
  { table: 'sessions', key: 'token_hash', type: 'text' },
  { table: 'orders', key: 'id', type: 'uuid' },
  { table: 'enquiries', key: 'id', type: 'uuid' },
  { table: 'enquiry_settings', key: 'singleton', type: 'boolean', optional: true },
  { table: 'wishlist', key: 'id', type: 'uuid', optional: true },
  { table: 'coupons', key: 'code', type: 'text', optional: true },
  { table: 'notifications', key: 'id', type: 'text', optional: true },
  { table: 'notification_reads', key: 'id', type: 'uuid', optional: true }
] as const;

type Table = typeof tables[number];
type Cursor = string | number | boolean | null;

class ImportError extends Error {}

async function copyTable(source: DatabaseExecutor, target: DatabaseExecutor, entry: Table) {
  const { table, key, type } = entry;
  const identity = 'identity' in entry ? entry.identity : null;
  const override = identity ? ' OVERRIDING SYSTEM VALUE' : '';
  if ('optional' in entry) {
    const { rows } = await source.query('SELECT 1 WHERE to_regclass($1) IS NOT NULL', [table]);
    if (!rows.length) return 0;
  }
  let cursor: Cursor = null;
  let count = 0;
  while (true) {
    const page: { rows: { key: Cursor; data: string }[] } = await source.query(
      `SELECT ${key} AS key, row_to_json(item)::text AS data FROM ${table} AS item
        WHERE ${key} > $1::${type} OR $1::${type} IS NULL ORDER BY ${key} LIMIT 20`, [cursor]
    );
    if (!page.rows.length) break;
    for (const row of page.rows) {
      const data = table === 'orders' ? JSON.stringify({ discount: 0, ...JSON.parse(row.data) }) : row.data;
      await target.query(
        `INSERT INTO ${table}${override} SELECT * FROM json_populate_record(NULL::${table}, $1::json)`, [data]
      );
    }
    count += page.rows.length;
    cursor = page.rows[page.rows.length - 1].key;
  }

  if (identity) {
    await target.query(
      `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE(MAX(${identity}), 1), MAX(${identity}) IS NOT NULL) FROM ${table}`,
      [table, identity]
    );
  }
  return count;
}

async function run() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new ImportError('Set DATABASE_URL in backend/.env before running the import.');

  const postgres = openPostgresDatabase(url);
  try {
    if (process.argv.includes('--check')) {
      const { rows: [connection] } = await postgres.query<{ version: string }>('SHOW server_version');
      console.log('Connected to PostgreSQL ' + (Object.values(connection)[0] ?? ''));
      return;
    }

    const versionFile = await stat(join(embeddedDirectory(), 'PG_VERSION')).catch(() => null);
    if (!versionFile?.isFile()) throw new ImportError('No existing PGlite store found. Check STORE_DATABASE_DIR.');

    const embedded = await openEmbeddedDatabase();
    try {
      const counts = await embedded.transaction(async source => {
        await source.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        return postgres.transaction(async target => {
          await lockPostgresSchema(target);
          const { rows } = await target.query<{ name: string }>(
            'SELECT name FROM unnest($1::text[]) AS names(name) WHERE to_regclass(quote_ident(name)) IS NOT NULL',
            [['store_migrations', ...tables.map(entry => entry.table)]]
          );
          if (rows.length) {
            throw new ImportError('The target already contains store tables. Import into a new empty PostgreSQL database before starting the store.');
          }

          await initializeSchema(target, false);
          const counts = [];
          for (const entry of tables) {
            counts.push({ table: entry.table, rows: await copyTable(source, target, entry) });
          }
          await seedReadingPreviews(target);
          return counts;
        });
      });
      console.table(counts);
      console.log('Import committed. Start the store with the same DATABASE_URL.');
    } finally {
      await embedded.close();
    }
  } finally {
    await postgres.close();
  }
}

try {
  await run();
} catch (error) {
  console.error(error instanceof ImportError ? error.message : 'Database command failed. Check DATABASE_URL, database permissions and the source schema (' + databaseErrorCode(error) + ').');
  process.exitCode = 1;
}
