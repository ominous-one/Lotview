/**
 * Data Retention & Cleanup Service
 * Automatically purges old data according to retention policies.
 * Run as a scheduled job via the worker process.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  auditLogs,
  vehicleViews,
  scrapeRuns,
  scrapeQueue,
  messengerMessages,
  vehicleAuditEvents,
  postingQueueEvents,
  fbInboxMessages,
  passwordResetTokens,
} from "../../shared/schema";
import { logger } from "../services/logger";

export interface RetentionPolicy {
  table: string;
  days: number;
  column: string;
}

const DEFAULT_POLICIES: RetentionPolicy[] = [
  { table: "audit_logs", days: 90, column: "created_at" },
  { table: "vehicle_views", days: 30, column: "created_at" },
  { table: "scrape_runs", days: 60, column: "created_at" },
  { table: "scrape_queue", days: 30, column: "created_at" },
  { table: "messenger_messages", days: 90, column: "created_at" },
  { table: "vehicle_audit_events", days: 90, column: "created_at" },
  { table: "posting_queue_events", days: 30, column: "created_at" },
  { table: "fb_inbox_messages", days: 90, column: "created_at" },
  { table: "password_reset_tokens", days: 1, column: "expires_at" },
];

/**
 * Apply data retention policies.
 * Returns summary of what was cleaned.
 */
export async function applyDataRetention(policies = DEFAULT_POLICIES): Promise<{
  totalDeleted: number;
  details: Array<{ table: string; deleted: number; days: number }>;
}> {
  const details: Array<{ table: string; deleted: number; days: number }> = [];
  let totalDeleted = 0;

  logger.info("Starting data retention cleanup", { policies: policies.length });

  for (const policy of policies) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.days);

      // Use raw SQL for deletions (Drizzle doesn't support DELETE with complex WHERE yet)
      const result = await db.execute(sql`
        DELETE FROM ${sql.raw(policy.table)}
        WHERE ${sql.raw(policy.column)} < ${cutoffDate}
      `);

      const deleted = result.rowCount || 0;
      totalDeleted += deleted;
      details.push({ table: policy.table, deleted, days: policy.days });

      if (deleted > 0) {
        logger.info(`Purged ${deleted} rows from ${policy.table} (>${policy.days} days)`, {
          table: policy.table, deleted, cutoff: cutoffDate.toISOString(),
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to purge ${policy.table}`, error instanceof Error ? error : new Error(msg), {
        table: policy.table, days: policy.days,
      });
      details.push({ table: policy.table, deleted: 0, days: policy.days });
    }
  }

  logger.info("Data retention cleanup complete", { totalDeleted, tables: details.length });
  return { totalDeleted, details };
}

/**
 * Anonymize deleted user data (GDPR compliance).
 * Removes PII from soft-deleted records.
 */
export async function anonymizeDeletedUsers(): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const result = await db.execute(sql`
      UPDATE users
      SET email = 'deleted_' || id || '@anonymized.local',
          name = 'Deleted User',
          phone = NULL,
          updated_at = NOW()
      WHERE deleted_at IS NOT NULL
        AND deleted_at < ${thirtyDaysAgo}
        AND email NOT LIKE 'deleted_%@anonymized.local'
    `);

    const updated = result.rowCount || 0;
    if (updated > 0) {
      logger.info(`Anonymized ${updated} deleted user records`, { updated });
    }
    return updated;
  } catch (error) {
    logger.error("Failed to anonymize deleted users", error instanceof Error ? error : new Error(String(error)));
    return 0;
  }
}
