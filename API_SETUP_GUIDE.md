# Enterprise Market Data API Setup Guide

This guide will help you configure the premium API integrations for world-class market pricing analysis that beats vAuto.

## Overview

The system uses a **three-tier data strategy** for maximum reliability:

1. **MarketCheck API** (Primary) - Paid, enterprise-grade Canadian market data
2. **Apify AutoTrader.ca** (Secondary) - Managed web scraping with quality guarantees
3. **Puppeteer Scraper** (Fallback) - Free but only used when premium sources fail

## Current Status

✅ **Puppeteer Scraper**: Working (free fallback)  
⚠️ **MarketCheck API**: Requires API key  
⚠️ **Apify Service**: Requires API token

---

## 1. MarketCheck API Setup (Recommended)

**Why MarketCheck?**
- Enterprise-grade Canadian automotive data
- Real dealer and private party listings across Canada
- Cleanest data with lat/lon for radius searches
- Trusted by dealerships and automotive platforms

### Sign Up

1. Visit: https://www.marketcheck.com/automotive/api
2. Click "Get Started" or "Request API Access"
3. Choose a plan:
   - **Starter**: ~$99/month (500 searches/month)
   - **Professional**: ~$299/month (2,500 searches/month)
   - **Enterprise**: Custom pricing (unlimited searches)

### Get Your API Key

1. After signup, navigate to your dashboard
2. Find "API Keys" or "Credentials" section
3. Copy your API key

### Configure in Replit

1. In the Replit sidebar, click **Secrets** (lock icon)
2. Add a new secret:
   - **Key**: `MARKETCHECK_API_KEY`
   - **Value**: Paste your MarketCheck API key
3. Click "Add Secret"

### Test It

Once configured, the system will automatically use MarketCheck as the primary data source.

---

## 2. Apify AutoTrader.ca Setup (Recommended)

**Why Apify?**
- Managed, enterprise-quality web scraping
- AutoTrader.ca is Canada's largest automotive marketplace
- No infrastructure headaches - Apify handles browser automation
- Automatic retries and quality monitoring

### Sign Up

1. Visit: https://apify.com/
2. Click "Sign Up" (free tier available)
3. Verify your email

### Get Your API Token

1. Go to Settings → Integrations
2. Find "Personal API tokens"
3. Click "Generate new token"
4. Copy the token (starts with `apify_api_...`)

### Find the AutoTrader.ca Actor

1. Browse Apify Store: https://apify.com/store
2. Search for "AutoTrader.ca" or "Canadian car listings"
3. Note the Actor ID (format: `username/actor-name`)
   - Example: `apify/autotrader-ca-scraper`

### Configure in Replit

1. In the Replit sidebar, click **Secrets**
2. Add these secrets:
   - **Key**: `APIFY_API_TOKEN`  
     **Value**: Your Apify API token
   - **Key**: `APIFY_AUTOTRADER_ACTOR_ID`  
     **Value**: The Actor ID (e.g., `apify/autotrader-ca-scraper`)
3. Click "Add Secret" for each

### Test It

The system will use Apify as a secondary source when MarketCheck doesn't have enough data.

---

## 3. Current Fallback: Puppeteer Scraper

The free Puppeteer-based scraper is already working and will automatically activate when:
- No premium APIs are configured, OR
- Premium APIs return fewer than 20 listings

**No setup required** - this runs automatically in the Replit environment.

---

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `MARKETCHECK_API_KEY` | Recommended | MarketCheck API key for Canadian market data |
| `APIFY_API_TOKEN` | Recommended | Apify API token for managed scraping |
| `APIFY_AUTOTRADER_ACTOR_ID` | If using Apify | Actor ID for AutoTrader.ca scraper |

---

## Testing Your Setup

1. Log in as a manager: `manager@olympicauto.com` / `manager123`
2. Go to "Market Pricing Analysis"
3. Configure your postal code in Settings
4. Search for a vehicle (e.g., "HYUNDAI KONA 2022")
5. Click "Refresh Market Data"
6. Check the response - it will show:
   - **MarketCheck count**: Listings from MarketCheck API
   - **Apify count**: Listings from Apify
   - **Scraper count**: Listings from fallback Puppeteer

---

## Cost Estimates

### MarketCheck
- **Free Tier**: None
- **Starter**: $99/month (500 searches)
- **Professional**: $299/month (2,500 searches)
- **Enterprise**: Custom pricing

### Apify
- **Free Tier**: $5 platform credits/month (~50 scrapes)
- **Personal**: $49/month (200 actor compute hours)
- **Team**: $499/month (2,000 actor compute hours)

### Puppeteer Scraper
- **Cost**: FREE (runs on Replit)
- **Limitation**: Less reliable, may break if AutoTrader changes HTML

---

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify your API keys are correct in Replit Secrets
3. Test each service individually
4. Contact the AI agent for troubleshooting assistance

---

## Next Steps

After configuring the APIs:
1. Test with real searches to ensure data quality
2. Monitor your API usage in MarketCheck/Apify dashboards
3. Adjust search parameters (radius, year range) to optimize results
4. Use the enhanced Market Pricing UI to compare Canadian market data

Your system is now ready to deliver **world-class market pricing analysis** with enterprise-grade Canadian data! 🚗💰
