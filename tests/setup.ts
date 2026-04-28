/**
 * Test Setup — Shared initialization for all test suites.
 */

import { afterAll } from "vitest";

process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgres://lotview:lotview@127.0.0.1:5432/lotview_test";

// Clean up after all tests
afterAll(async () => {
  const { pool } = await import("../server/db");
  await pool.end().catch(() => undefined);
});
