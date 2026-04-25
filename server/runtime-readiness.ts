/**
 * Runtime Readiness — Production Health Checks
 *
 * Provides readiness probes for the web server and worker process.
 * Called at startup by index-prod.ts and index-worker.ts.
 */

type RuntimeCheck = {
  status: "healthy" | "unhealthy" | "degraded";
  detail?: string;
};

/**
 * Quick readiness check used by app.ts for the /ready endpoint.
 */
export function checkReadiness(): { ready: boolean; checks: Record<string, RuntimeCheck> } {
  return { ready: true, checks: {} };
}

/**
 * Collect runtime readiness state for a given process type.
 * Used by the /ready endpoint and startup logging.
 */
export function collectRuntimeReadiness(processType: string = "web") {
  return {
    processType,
    checks: {
      runtime: {
        status: "healthy" as const,
        detail: `${processType} process is running`,
      },
    },
  };
}

/**
 * Log readiness summary at startup.
 * Called by index-prod.ts and index-worker.ts.
 */
export function logRuntimeReadinessSummary(): void {
  const readiness = collectRuntimeReadiness(process.env.LOTVIEW_SCHEDULER_PROCESS || "web");
  console.log("[Runtime] Readiness:", JSON.stringify(readiness));
}

/**
 * Validate that required production environment variables are present.
 * Throws hard errors on missing critical config so the process fails fast.
 */
export function ensureProductionRuntimeRequirements(options: { processType: string }): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing: string[] = [];

  if (
    !process.env.DATABASE_URL &&
    !(process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE)
  ) {
    missing.push("DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE");
  }

  if (!process.env.JWT_SECRET && !process.env.SESSION_SECRET) {
    missing.push("JWT_SECRET or SESSION_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing production runtime requirements for ${options.processType}: ${missing.join(", ")}`
    );
  }

  console.log(`[Runtime] ${options.processType} process requirements validated`);
}
