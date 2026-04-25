if (process.env.NODE_ENV !== 'production') {
  try {
    await import('dotenv/config');
  } catch {
    // Ignore missing dotenv in bundled/runtime environments.
  }
}

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema.ts";

// Use Replit's built-in database environment variables
const dbConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };

const effectiveDbConfig = (!dbConfig.connectionString && !dbConfig.host)
  ? (process.env.NODE_ENV === 'test'
      ? { connectionString: 'postgres://lotview-test:lotview-test@127.0.0.1:1/lotview_test' }
      : null)
  : dbConfig;

if (!effectiveDbConfig) {
  throw new Error('Database configuration not found. Please ensure the database is provisioned.');
}

// Production connection pool tuned for 100 dealerships.
// Web processes need more connections (serves concurrent HTTP requests).
// Worker processes need fewer (background job processing).
const isWorker = process.env.LOTVIEW_SCHEDULER_PROCESS === 'worker';
const poolSize = parseInt(
  process.env.PG_POOL_SIZE || (isWorker ? '20' : '50'),
  10
);

export const pool = new Pool({
  ...effectiveDbConfig,
  max: poolSize,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  query_timeout: 30000,
  idleTimeoutMillis: 10000,
  keepAlive: true,
});

// Log pool exhaustion warnings
pool.on('error', (err: Error) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export const db = drizzle(pool, { schema });

// Graceful pool shutdown helper
export async function closeDatabasePool(): Promise<void> {
  await pool.end();
}
