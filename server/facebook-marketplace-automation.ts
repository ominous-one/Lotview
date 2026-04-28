export async function postToMarketplace(..._args: unknown[]): Promise<any> {
  return { success: false, error: "facebook_marketplace_automation_not_configured", listingUrl: null };
}

export const facebookMarketplaceAutomation = {
  async postToMarketplace(..._args: unknown[]): Promise<any> {
    return { success: false, error: "facebook_marketplace_automation_not_configured", listingUrl: null };
  },
  async testConnection(..._args: unknown[]): Promise<any> {
    return { success: false, message: "facebook_marketplace_automation_not_configured" };
  },
};
