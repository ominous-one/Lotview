export async function postToMarketplace(_vehicle: any): Promise<{ success: false; error: string }> {
  return { success: false, error: "facebook_marketplace_automation_not_configured" };
}

export const facebookMarketplaceAutomation = {
  async postToMarketplace(): Promise<{ success: false; error: string }> {
    return { success: false, error: "facebook_marketplace_automation_not_configured" };
  },
  async testConnection(): Promise<{ success: false; message: string }> {
    return { success: false, message: "facebook_marketplace_automation_not_configured" };
  },
};
