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

export function logRuntimeReadinessSummary(): void {
  const processType = process.argv.some((arg) => arg.includes("index-worker")) ? "worker" : "web";
  const schedulerProcess = process.env.LOTVIEW_SCHEDULER_PROCESS || "worker";
  const enabledSchedulers = process.env.LOTVIEW_ENABLE_SCHEDULERS !== "false";
  console.log(
    `[Runtime] process=${processType} node_env=${process.env.NODE_ENV || "development"} schedulers=${enabledSchedulers ? "enabled" : "disabled"} scheduler_process=${schedulerProcess}`,
  );
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
