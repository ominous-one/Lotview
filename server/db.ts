if (process.env.NODE_ENV !== 'production') {
  try {
    await import('dotenv/config');
  } catch {
    // Ignore missing dotenv in bundled/runtime environments.
  }
}

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema";

const dbConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };

const hasConfig = !!(dbConfig.connectionString || dbConfig.host);

if (!hasConfig && process.env.NODE_ENV === 'production') {
  console.error('[DB] WARNING: No database config. Set DATABASE_URL or PGHOST etc.');
}

const poolSize = parseInt(process.env.PG_POOL_SIZE || '50', 10);

export const pool = hasConfig
  ? new Pool({ ...dbConfig, max: poolSize })
  : ({
      end: () => Promise.resolve(),
      on: () => {},
      query: () => Promise.reject(new Error('DB not configured')),
    } as any);

export const db = hasConfig ? drizzle(pool, { schema }) : null as any;

export async function closeDatabasePool(): Promise<void> {
  if (hasConfig) await pool.end();
}
