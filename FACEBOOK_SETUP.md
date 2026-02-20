# Facebook Marketplace Integration Setup

This guide will help you configure the Facebook integration for automated marketplace posting.

## Step 1: Create a Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "Create App" and select "Business" as the app type
3. Fill in the app details:
   - App Name: `Olympic Auto Group - Inventory Management`
   - App Contact Email: Your business email
   - Business Account: Select or create your business account

## Step 2: Configure Facebook Login

1. In your Facebook App dashboard, add "Facebook Login" product
2. Go to Settings → Basic and copy:
   - **App ID**
   - **App Secret**
3. In Settings → Advanced:
   - Set your OAuth Redirect URIs to: `https://your-domain.replit.app/api/facebook/oauth/callback`

## Step 3: Request Marketplace Permissions

1. Go to App Review → Permissions and Features
2. Request the following permissions:
   - `pages_manage_posts` - Post content to Facebook Pages
   - `pages_read_engagement` - Read Page engagement data
   - `catalog_management` - Manage product catalogs
3. Submit for review (may take 3-5 business days)

## Step 4: Set Environment Variables

Once you have your Facebook App credentials, add them to your Replit environment variables:

1. Open the "Secrets" tab (lock icon in the sidebar)
2. Add these environment variables:

```
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here
FACEBOOK_REDIRECT_URI=https://your-domain.replit.app/api/facebook/oauth/callback
```

**Important**: Replace `your-domain` with your actual Replit domain.

## Step 5: Restart the Application

After setting the environment variables, restart your application:
1. Click "Stop" in the Replit console
2. Click "Run" to restart with new credentials

## Step 6: Connect Facebook Accounts

1. Login to the application as a salesperson
2. Go to "Facebook Accounts" tab
3. Click "Add Account" to create an account entry
4. Click "Connect" button next to the account
5. Authorize the app to access your Facebook account
6. The account will now be connected and ready for posting

## Testing the Integration

1. Create an ad template with dynamic variables
2. Add a vehicle to the posting queue
3. Assign a Facebook account and template
4. Click "Post Now" to manually test posting
5. Verify the listing appears on Facebook Marketplace

## Troubleshooting

### "OAuth Error: Redirect URI Mismatch"
- Make sure your redirect URI in Facebook App settings matches exactly: `https://your-domain.replit.app/api/facebook/oauth/callback`
- Check that you've replaced `your-domain` with your actual Replit domain

### "Permission Denied" Errors
- Ensure you've requested and received approval for all required permissions
- Check that your Facebook App is in "Live" mode (not Development mode)

### "Token Expired" Errors
- Long-lived tokens expire after 60 days
- Re-connect the account to refresh the token
- Consider implementing automated token refresh (future enhancement)

## API Endpoints

The integration provides these endpoints:

- `GET /api/facebook/config/status` - Check if Facebook is configured
- `GET /api/facebook/oauth/init/:accountId` - Initiate OAuth flow
- `GET /api/facebook/oauth/callback` - OAuth callback handler
- `POST /api/facebook/post/:queueId` - Manually post a queue item

## Security Notes

- Never commit your App Secret to version control
- Store all credentials in Replit Secrets
- Long-lived tokens are encrypted in the database
- OAuth state parameter prevents CSRF attacks

## Next Steps

Once configured, you can:
1. Set up automated posting schedules
2. Create multiple Facebook account connections (up to 5 per salesperson)
3. Build custom ad templates for different vehicle types
4. Monitor posting analytics and performance
