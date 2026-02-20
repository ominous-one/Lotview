import type { Vehicle } from '@shared/schema';
import { logError } from './error-utils';

interface FacebookConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

interface PostingTemplate {
  titleTemplate: string;
  descriptionTemplate: string;
}

export class FacebookService {
  private defaultConfig: FacebookConfig;

  constructor() {
    this.defaultConfig = {
      appId: process.env.FACEBOOK_APP_ID || 'YOUR_FACEBOOK_APP_ID',
      appSecret: process.env.FACEBOOK_APP_SECRET || 'YOUR_FACEBOOK_APP_SECRET',
      redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'https://your-domain.replit.app/api/facebook/oauth/callback'
    };
  }

  getConfig(dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): FacebookConfig {
    return {
      appId: dealershipConfig?.facebookAppId || this.defaultConfig.appId,
      appSecret: dealershipConfig?.facebookAppSecret || this.defaultConfig.appSecret,
      redirectUri: this.defaultConfig.redirectUri,
    };
  }

  getAuthUrl(state: string, dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): string {
    const config = this.getConfig(dealershipConfig);
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      state,
      scope: 'pages_manage_posts,pages_read_engagement,pages_messaging,catalog_management',
      response_type: 'code'
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): Promise<{ accessToken: string; expiresIn: number }> {
    const config = this.getConfig(dealershipConfig);
    const params = new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.redirectUri,
      code
    });

    const response = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${params.toString()}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to exchange code for token');
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in
    };
  }

  async getUserInfo(accessToken: string): Promise<{ id: string; name: string }> {
    const response = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${accessToken}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get user info');
    }

    return response.json();
  }

  async getUserPages(accessToken: string): Promise<Array<{
    id: string;
    name: string;
    access_token: string;
    category: string;
    picture?: { data?: { url: string } };
  }>> {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,category,picture&access_token=${accessToken}`
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get user pages');
    }

    const data = await response.json();
    return data.data || [];
  }

  async getPageLongLivedToken(userAccessToken: string, pageId: string, dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): Promise<string> {
    const pages = await this.getUserPages(userAccessToken);
    const page = pages.find(p => p.id === pageId);
    
    if (!page) {
      throw new Error('Page not found or you do not have access to it');
    }
    
    return page.access_token;
  }

  async postToPage(pageAccessToken: string, pageId: string, message: string, link?: string, imageUrl?: string): Promise<{ postId: string }> {
    const params: Record<string, string> = {
      access_token: pageAccessToken,
      message,
    };
    
    if (link) {
      params.link = link;
    }

    let endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    
    if (imageUrl && !link) {
      params.url = imageUrl;
      endpoint = `https://graph.facebook.com/v18.0/${pageId}/photos`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to post to page');
    }

    const data = await response.json();
    return { postId: data.id || data.post_id };
  }

  async postVehicleToPage(pageAccessToken: string, pageId: string, vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string;
    price: number;
    odometer?: number;
    images?: string[];
    dealerVdpUrl?: string;
    description?: string;
  }): Promise<{ postId: string }> {
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
    
    let message = `🚗 ${vehicleName}\n`;
    message += `💰 $${vehicle.price.toLocaleString()} CAD\n`;
    if (vehicle.odometer) {
      message += `📍 ${vehicle.odometer.toLocaleString()} km\n`;
    }
    message += `\n`;
    if (vehicle.description) {
      message += vehicle.description.substring(0, 500);
      if (vehicle.description.length > 500) message += '...';
      message += '\n\n';
    }
    message += `📲 Contact us for more details!`;
    
    const imageUrl = vehicle.images?.[0];
    const link = vehicle.dealerVdpUrl;
    
    return this.postToPage(pageAccessToken, pageId, message, link, imageUrl);
  }

  async getLongLivedToken(shortLivedToken: string, dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): Promise<{ accessToken: string; expiresIn: number }> {
    const config = this.getConfig(dealershipConfig);
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortLivedToken
    });

    const response = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${params.toString()}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get long-lived token');
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in
    };
  }

  /**
   * Refresh a long-lived token before it expires.
   * Long-lived tokens can be refreshed as long as they're still valid.
   * After refresh, you get a new long-lived token (60 days).
   */
  async refreshLongLivedToken(currentToken: string, dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): Promise<{ accessToken: string; expiresIn: number }> {
    // Facebook allows exchanging a valid long-lived token for a new one
    return this.getLongLivedToken(currentToken, dealershipConfig);
  }

  /**
   * Validate a token and get its expiration info.
   * Returns null if token is invalid.
   */
  async validateToken(accessToken: string, dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): Promise<{ isValid: boolean; expiresAt?: Date; userId?: string } | null> {
    const config = this.getConfig(dealershipConfig);
    try {
      const params = new URLSearchParams({
        input_token: accessToken,
        access_token: `${config.appId}|${config.appSecret}` // App access token
      });

      const response = await fetch(`https://graph.facebook.com/v18.0/debug_token?${params.toString()}`);
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data.data) return null;

      return {
        isValid: data.data.is_valid,
        expiresAt: data.data.expires_at ? new Date(data.data.expires_at * 1000) : undefined,
        userId: data.data.user_id
      };
    } catch (error) {
      logError('Error validating Facebook token', error instanceof Error ? error : new Error(String(error)), { service: 'facebook' });
      return null;
    }
  }

  /**
   * Check if a token needs refresh (expires within specified days).
   */
  tokenNeedsRefresh(expiresAt: Date | null | undefined, daysBeforeExpiry: number = 7): boolean {
    if (!expiresAt) return false;
    const refreshThreshold = new Date();
    refreshThreshold.setDate(refreshThreshold.getDate() + daysBeforeExpiry);
    return expiresAt <= refreshThreshold;
  }

  private replaceTemplateVariables(template: string, vehicle: Vehicle): string {
    return template
      .replace(/{price}/g, vehicle.price?.toString() || '0')
      .replace(/{year}/g, vehicle.year.toString())
      .replace(/{make}/g, vehicle.make)
      .replace(/{model}/g, vehicle.model)
      .replace(/{trim}/g, vehicle.trim || '')
      .replace(/{odometer}/g, vehicle.odometer?.toString() || '0')
      .replace(/{carfaxUrl}/g, vehicle.carfaxUrl || '');
  }

  async postToMarketplace(
    accessToken: string,
    vehicle: Vehicle,
    template: PostingTemplate
  ): Promise<{ postId: string }> {
    const title = this.replaceTemplateVariables(template.titleTemplate, vehicle);
    const description = this.replaceTemplateVariables(template.descriptionTemplate, vehicle);

    const formData = new FormData();
    formData.append('access_token', accessToken);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('price', vehicle.price?.toString() || '0');
    formData.append('currency', 'CAD');
    formData.append('availability', 'in stock');
    
    if (vehicle.images && vehicle.images.length > 0) {
      const maxImages = 10;
      vehicle.images.slice(0, maxImages).forEach((imageUrl, index) => {
        formData.append(`images[${index}][url]`, imageUrl);
      });
    }

    const response = await fetch('https://graph.facebook.com/v18.0/me/marketplace_listings', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to post to Marketplace');
    }

    const data = await response.json();
    return { postId: data.id };
  }

  async deleteMarketplaceListing(accessToken: string, postId: string): Promise<void> {
    const response = await fetch(`https://graph.facebook.com/v18.0/${postId}?access_token=${accessToken}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to delete listing');
    }
  }

  isConfigured(dealershipConfig?: { facebookAppId?: string | null; facebookAppSecret?: string | null }): boolean {
    const config = this.getConfig(dealershipConfig);
    return (
      config.appId !== 'YOUR_FACEBOOK_APP_ID' &&
      config.appSecret !== 'YOUR_FACEBOOK_APP_SECRET' &&
      this.defaultConfig.redirectUri !== 'https://your-domain.replit.app/api/facebook/oauth/callback'
    );
  }

  /**
   * Send a message to a Messenger conversation using the Send API.
   * Requires pages_messaging permission.
   * @param pageAccessToken - The page access token
   * @param recipientPsid - The Page-Scoped User ID of the recipient
   * @param messageText - The message text to send
   */
  async sendMessengerMessage(pageAccessToken: string, recipientPsid: string, messageText: string): Promise<{ messageId: string; recipientId: string }> {
    const response = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        message: { text: messageText }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || 'Failed to send message');
    }

    const data = await response.json();
    return {
      messageId: data.message_id,
      recipientId: data.recipient_id
    };
  }

  /**
   * Get messages from a conversation thread.
   * @param pageAccessToken - The page access token
   * @param conversationId - The Facebook conversation ID
   */
  async getConversationMessages(pageAccessToken: string, conversationId: string): Promise<Array<{
    id: string;
    message: string;
    from: { id: string; name: string };
    created_time: string;
  }>> {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${conversationId}/messages?fields=id,message,from,created_time&access_token=${pageAccessToken}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get conversation messages');
    }

    const data = await response.json();
    return data.data || [];
  }
}

export const facebookService = new FacebookService();
