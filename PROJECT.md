# LotView

## What This Is
A CRM platform for car dealerships. Its core product is a sub-website that scrapes a dealership's used inventory from their existing DMS/inventory feed and creates optimized Vehicle Detail Pages (VDPs). Built for three user tiers:

- **General Managers**: Register the dealership, create user accounts, manage settings, view analytics
- **Sales Managers**: Appraise trade-in vehicles, save appraisals, view full inventory, see competitor pricing to ensure competitive positioning
- **Salespeople**: Use a Chrome extension to auto-post vehicles to Facebook Marketplace and Craigslist with AI-generated listings that highlight value-add features from the VDP data

## Target Audience
- Independent and franchise used car dealerships (10-200 units in inventory)
- Dealership staff who are NOT tech-savvy — UI must be dead simple
- GMs care about pricing intelligence and competitive edge
- Sales managers care about speed and accuracy of appraisals
- Salespeople care about posting vehicles fast with minimal effort

## Business Model
- SaaS: $299/mo per dealership (base), $499/mo with competitive pricing intelligence
- Chrome extension included in all tiers
- Revenue target: 100 dealerships = $29,900-$49,900/mo recurring
- Sales motion: outbound cold outreach to dealership GMs → demo → trial → close

## Tech Stack
- Frontend: Next.js 14+ (App Router), Tailwind CSS, shadcn/ui
- Backend: Node.js API routes or separate Express/Fastify service
- Database: PostgreSQL (Supabase or Railway)
- Inventory scraping: Puppeteer/Playwright for DMS feeds, scheduled cron jobs
- Chrome extension: Manifest V3, content scripts for Marketplace/Craigslist
- AI listings: Anthropic Claude API for generating vehicle descriptions
- Hosting: Vercel (frontend), Railway (backend/DB), or GoHighLevel for marketing site
- Competitor pricing: web scraping of competing dealer sites + market data APIs

## Brand Voice
Professional, no-nonsense, results-oriented. Speaks the language of car dealers — not Silicon Valley. Uses terms like "units," "lot," "turn rate," "days on lot." Confident without being salesy. The tool sells itself through ROI, not hype.

## Current Status
- Early development
- VDP page template needs design and build
- Inventory scraping engine needs architecture
- Chrome extension is conceptual
- Competitive pricing module not started
- Priority: architect the full system, then build VDP scraper + page renderer

## Key Technical Requirements
- VDP pages must load in under 2 seconds
- Inventory sync must run every 4 hours minimum
- Chrome extension must work on Facebook Marketplace and Craigslist posting forms
- AI listings must include: year, make, model, mileage, key features, condition notes, call-to-action
- Competitive pricing must show at minimum 5 comparable vehicles within 50-mile radius
- Multi-tenant architecture: one codebase, data isolation per dealership
- RBAC: GM > Sales Manager > Salesperson permission tiers
