import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export type DatabaseExecutor = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<unknown>;
};

export type StoreDatabase = DatabaseExecutor & {
  transaction: <T>(work: (tx: DatabaseExecutor) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export function embeddedDirectory() {
  return resolve(process.env.STORE_DATABASE_DIR || '.data/store');
}

export async function openEmbeddedDatabase(): Promise<StoreDatabase> {
  const directory = embeddedDirectory();
  await mkdir(directory, { recursive: true });
  return new PGlite(directory);
}

export function openPostgresDatabase(connectionString: string): StoreDatabase {
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length <= 1) throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL with a database name.');
  }

  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  pool.on('error', error => console.error('Idle PostgreSQL connection lost:', databaseErrorCode(error)));

  function executor(client: pg.Pool | pg.PoolClient): DatabaseExecutor {
    return {
      query: async <T>(sql: string, params?: unknown[]) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as T[] };
      },
      exec: async sql => { await client.query(sql); }
    };
  }

  return {
    ...executor(pool),
    async transaction(work) {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query('BEGIN');
        const result = await work(executor(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
        throw error;
      } finally {
        client.release(discard);
      }
    },
    close: () => pool.end()
  };
}

export function databaseErrorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'UNKNOWN';
}
