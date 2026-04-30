export async function getMarketCheckServiceForDealership(_dealershipId: number): Promise<{
  getVINPricing(vin: string, mileage?: number, postalCode?: string): Promise<null>;
  getLiveMarketStats(params: Record<string, unknown>): Promise<null>;
} | null> {
  return null;
}
