export const marketAggregationService = {
  async aggregate(..._args: unknown[]): Promise<{ listings: unknown[]; total: 0 }> {
    return { listings: [], total: 0 };
  },
  async search(..._args: unknown[]): Promise<{ listings: unknown[]; total: 0 }> {
    return { listings: [], total: 0 };
  },
  async aggregateMarketData(..._args: unknown[]): Promise<any> {
    return { success: false, listings: [], total: 0, error: "Market aggregation is not configured" };
  },
};
