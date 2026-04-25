/**
 * Test Setup — Shared initialization for all test suites.
 */

import { pool } from "../server/db";

// Clean up after all tests
afterAll(async () => {
  await pool.end();
});
