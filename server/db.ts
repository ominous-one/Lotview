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

export const pool = new Pool(effectiveDbConfig);
export const db = drizzle(pool, { schema });
