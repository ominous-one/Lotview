import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

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

if (!dbConfig.connectionString && !dbConfig.host) {
  throw new Error('Database configuration not found. Please ensure the database is provisioned.');
}

export const pool = new Pool(dbConfig);
export const db = drizzle(pool, { schema });
