export function createCompetitorMonitoringService(_dealershipId: number): {
  getAlertSummary(): Promise<Record<string, number>>;
  runCompetitorScan(): Promise<{ success: false; error: string }>;
} {
  return {
    async getAlertSummary() {
      return { total: 0, open: 0, acknowledged: 0, resolved: 0 };
    },
    async runCompetitorScan() {
      return { success: false, error: "Competitor monitoring is not configured" };
    },
  };
}
