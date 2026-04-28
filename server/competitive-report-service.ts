export class CompetitiveReportService {
  async runCompetitiveReport(_params: Record<string, unknown>): Promise<{ success: false; error: string }> {
    return { success: false, error: "Competitive report service is not configured" };
  }
}
