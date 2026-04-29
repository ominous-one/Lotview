export const enhancedMarketAnalysis = {
  async analyze(..._args: unknown[]): Promise<{ success: false; error: string }> {
    return { success: false, error: "Enhanced market analysis is not configured" };
  },
};
