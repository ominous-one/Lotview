/**
 * Scheduler Notifications — Stub
 * Re-export from services for backward compatibility
 */
export { initializeFlagsFromEnv, isEnabled } from "./services/feature-flags";
export { default as schedulerIntegration } from "./services/scheduler-integration";

export function startNotificationsScheduler(): void {
  return;
}
