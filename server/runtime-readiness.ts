import fs from "node:fs";
import path from "node:path";

type ProcessType = "web" | "worker";

interface RuntimeRequirementOptions {
  processType: ProcessType;
}

function getRequiredEnv(processType: ProcessType): string[] {
  const shared = ["DATABASE_URL", "JWT_SECRET"];
  if (processType === "web") {
    return shared;
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
  const migrationsPath = path.resolve(import.meta.dirname, "..", "migrations");
  return fs.existsSync(migrationsPath);
}

export function logRuntimeReadinessSummary(): void {
  const processType = process.argv.some((arg) => arg.includes("index-worker")) ? "worker" : "web";
  const schedulerProcess = process.env.LOTVIEW_SCHEDULER_PROCESS || "worker";
  const enabledSchedulers = process.env.LOTVIEW_ENABLE_SCHEDULERS !== "false";
  const dbConfigSource = detectDatabaseConfigSource();
  const migrationsPresent = migrationsDirectoryPresent();

  console.log(
    `[Runtime] process=${processType} node_env=${process.env.NODE_ENV || "development"} schedulers=${enabledSchedulers ? "enabled" : "disabled"} scheduler_process=${schedulerProcess} db_config=${dbConfigSource} migrations_dir=${migrationsPresent ? "present" : "missing"}`,
  );

  if (dbConfigSource !== "DATABASE_URL") {
    console.warn(
      `[Runtime] Drift indicator: expected DATABASE_URL-backed runtime, detected ${dbConfigSource}.`,
    );
  }

  if (!migrationsPresent) {
    console.warn("[Runtime] Drift indicator: migrations directory missing from runtime bundle/workspace.");
  }
}

export function ensureProductionRuntimeRequirements({ processType }: RuntimeRequirementOptions): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = getRequiredEnv(processType).filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`[Runtime] Missing required production env vars for ${processType}: ${missing.join(", ")}`);
  }
}
