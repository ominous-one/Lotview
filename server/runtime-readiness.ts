import fs from "node:fs";
import path from "node:path";

type ProcessType = "web" | "worker";

interface RuntimeRequirementOptions {
  processType: ProcessType;
}

export interface RuntimeCheckResult {
  status: "healthy" | "unhealthy" | "warning";
  detail: string;
}

export interface RuntimeReadinessReport {
  processType: ProcessType;
  overallStatus: "healthy" | "not_ready";
  checks: Record<string, RuntimeCheckResult>;
}

function getRequiredEnv(processType: ProcessType): string[] {
  const shared = ["DATABASE_URL", "JWT_SECRET"];

  if (processType === "web") {
    return [...shared, "SESSION_SECRET"];
  }

  return shared;
}

function detectDatabaseConfigSource(): "DATABASE_URL" | "PG*" | "missing" {
  if (process.env.DATABASE_URL) {
    return "DATABASE_URL";
  }

  if (process.env.PGHOST || process.env.PGPORT || process.env.PGUSER || process.env.PGDATABASE) {
    return "PG*";
  }

  return "missing";
}

function migrationsDirectoryPresent(): boolean {
  const migrationsPath = path.resolve(process.cwd(), 'migrations');
  return fs.existsSync(migrationsPath);
}

function webStaticBundlePresent(): boolean {
  const candidatePaths = [
    path.resolve(process.cwd(), 'dist', 'public', 'index.html'),
    path.resolve(process.cwd(), 'server', 'public', 'index.html'),
    path.resolve(process.cwd(), 'public', 'index.html'),
  ];
  return candidatePaths.some((candidatePath) => fs.existsSync(candidatePath));
}

function evaluateSchedulerConfiguration(processType: ProcessType): RuntimeCheckResult {
  const schedulerProcess = process.env.LOTVIEW_SCHEDULER_PROCESS || "worker";
  const enabledSchedulers = process.env.LOTVIEW_ENABLE_SCHEDULERS !== "false";

  if (processType === "web") {
    if (enabledSchedulers) {
      return {
        status: "warning",
        detail: `Web process has schedulers enabled (scheduler_process=${schedulerProcess}). Render web dynos should usually keep LOTVIEW_ENABLE_SCHEDULERS=false and delegate jobs to the worker.`,
      };
    }

    return {
      status: "healthy",
      detail: `Web process scheduler posture is safe (enabled=${enabledSchedulers}, scheduler_process=${schedulerProcess}).`,
    };
  }

  if (!enabledSchedulers) {
    return {
      status: "warning",
      detail: `Worker process has schedulers disabled. Background jobs will not run until LOTVIEW_ENABLE_SCHEDULERS is restored.`,
    };
  }

  if (schedulerProcess !== "worker") {
    return {
      status: "warning",
      detail: `Worker process expected LOTVIEW_SCHEDULER_PROCESS=worker but found ${schedulerProcess}.`,
    };
  }

  return {
    status: "healthy",
    detail: `Worker scheduler posture is healthy (enabled=${enabledSchedulers}, scheduler_process=${schedulerProcess}).`,
  };
}

export function collectRuntimeReadiness(processType: ProcessType): RuntimeReadinessReport {
  const dbConfigSource = detectDatabaseConfigSource();
  const missingEnv = getRequiredEnv(processType).filter((name) => !process.env[name]);

  const checks: Record<string, RuntimeCheckResult> = {
    env: missingEnv.length === 0
      ? { status: "healthy", detail: `Required ${processType} env vars present.` }
      : { status: "unhealthy", detail: `Missing required ${processType} env vars: ${missingEnv.join(", ")}` },
    database_config: dbConfigSource === "DATABASE_URL"
      ? { status: "healthy", detail: "DATABASE_URL is configured." }
      : {
          status: "unhealthy",
          detail: dbConfigSource === "missing"
            ? "DATABASE_URL is missing."
            : `Expected DATABASE_URL-backed runtime, detected ${dbConfigSource}.`,
        },
    migrations: migrationsDirectoryPresent()
      ? { status: "healthy", detail: "Migrations directory is present." }
      : { status: "warning", detail: "Migrations directory is missing from the runtime bundle/workspace." },
    scheduler_configuration: evaluateSchedulerConfiguration(processType),
  };

  if (processType === "web") {
    checks.static_bundle = webStaticBundlePresent()
      ? { status: "healthy", detail: "Static client bundle is present." }
      : { status: "unhealthy", detail: "Static client bundle is missing (dist/public/index.html not found)." };
  }

  const overallStatus = Object.values(checks).some((check) => check.status === "unhealthy")
    ? "not_ready"
    : "healthy";

  return {
    processType,
    overallStatus,
    checks,
  };
}

export function logRuntimeReadinessSummary(): void {
  const processType = process.argv.some((arg) => arg.includes("index-worker")) ? "worker" : "web";
  const schedulerProcess = process.env.LOTVIEW_SCHEDULER_PROCESS || "worker";
  const enabledSchedulers = process.env.LOTVIEW_ENABLE_SCHEDULERS !== "false";
  const dbConfigSource = detectDatabaseConfigSource();
  const migrationsPresent = migrationsDirectoryPresent();
  const staticBundlePresent = processType === "web" ? webStaticBundlePresent() : true;

  console.log(
    `[Runtime] process=${processType} node_env=${process.env.NODE_ENV || "development"} schedulers=${enabledSchedulers ? "enabled" : "disabled"} scheduler_process=${schedulerProcess} db_config=${dbConfigSource} migrations_dir=${migrationsPresent ? "present" : "missing"} static_bundle=${staticBundlePresent ? "present" : "missing"}`,
  );

  if (dbConfigSource !== "DATABASE_URL") {
    console.warn(
      `[Runtime] Drift indicator: expected DATABASE_URL-backed runtime, detected ${dbConfigSource}.`,
    );
  }

  if (!migrationsPresent) {
    console.warn("[Runtime] Drift indicator: migrations directory missing from runtime bundle/workspace.");
  }

  if (processType === "web" && !staticBundlePresent) {
    console.warn("[Runtime] Drift indicator: static client bundle missing from dist/public.");
  }
}

export function ensureProductionRuntimeRequirements({ processType }: RuntimeRequirementOptions): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const report = collectRuntimeReadiness(processType);
  const unhealthyChecks = Object.entries(report.checks)
    .filter(([, check]) => check.status === "unhealthy")
    .map(([name, check]) => `${name}: ${check.detail}`);

  const warningChecks = Object.entries(report.checks)
    .filter(([, check]) => check.status === "warning")
    .map(([name, check]) => `${name}: ${check.detail}`);

  // Log all warnings
  for (const check of warningChecks) {
    console.warn(`[Runtime] Warning: ${check}`);
  }

  // Log unhealthy checks as CRITICAL but DO NOT crash the server
  // In production, the server should start and let operators fix issues
  for (const check of unhealthyChecks) {
    console.error(`[Runtime] CRITICAL (non-blocking): ${check}`);
  }

  if (unhealthyChecks.length > 0) {
    console.error(`[Runtime] ${unhealthyChecks.length} critical checks failed. Server is starting anyway — fix these issues immediately.`);
  }
}
