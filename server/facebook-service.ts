/**
 * Facebook Service — Minimal production stub
 * Provides marketplace posting and page management.
 * Full implementation would use facebook-sdk or direct Graph API calls.
 */

import { logger } from "./services/logger";

interface Vehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price?: number;
  odometer?: number;
  description?: string;
  images?: string[];
}

interface PostOptions {
  titleTemplate: string;
  descriptionTemplate: string;
}

export const facebookService = {
  isConfigured(): boolean {
    return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  },

  getAuthUrl(state: string): string {
    const appId = process.env.FACEBOOK_APP_ID;
    const redirectUri = `${process.env.APP_URL || "https://app.lotview.ai"}/api/facebook/callback`;
    return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=pages_manage_posts,pages_read_engagement`;
  },

  async exchangeCodeForToken(code: string): Promise<{ accessToken: string }> {
    // Stub: would call Facebook Graph API
    logger.info("Facebook token exchange stub", { code: code.slice(0, 10) + "..." });
    return { accessToken: "stub_token_" + Date.now() };
  },

  async getLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresAt?: Date }> {
    logger.info("Facebook long-lived token stub");
    return { accessToken: shortToken, expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) };
  },

  async getUserInfo(token: string): Promise<{ id: string; name: string }> {
    return { id: "stub_user_id", name: "Stub User" };
  },

  async getUserPages(token: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
    return [];
  },

  async postToMarketplace(
    accessToken: string,
    vehicle: Vehicle,
    options: PostOptions
  ): Promise<{ postId: string; permalink?: string }> {
    const title = options.titleTemplate
      .replace(/\{\{year\}\}/g, String(vehicle.year))
      .replace(/\{\{make\}\}/g, vehicle.make)
      .replace(/\{\{model\}\}/g, vehicle.model)
      .replace(/\{\{trim\}\}/g, vehicle.trim || "")
      .replace(/\{\{price\}\}/g, vehicle.price ? `$${vehicle.price.toLocaleString()}` : "")
      .trim();

    logger.info("Facebook Marketplace post stub", { title, vehicleId: vehicle.id });
    return { postId: `fb_post_${Date.now()}` };
  },

  async postToPage(accessToken: string, pageId: string, message: string): Promise<{ postId: string }> {
    logger.info("Facebook page post stub", { pageId, message: message.slice(0, 50) });
    return { postId: `fb_page_post_${Date.now()}` };
  },

  async postVehicleToPage(
    accessToken: string,
    pageId: string,
    vehicle: Vehicle,
    template: PostOptions
  ): Promise<{ postId: string }> {
    return this.postToPage(accessToken, pageId, template.descriptionTemplate);
  },

  async sendMessengerMessage(
    accessToken: string,
    recipientId: string,
    message: string
  ): Promise<{ messageId: string }> {
    logger.info("Facebook messenger stub", { recipientId, message: message.slice(0, 50) });
    return { messageId: `fb_msg_${Date.now()}` };
  },
};

export default facebookService;
