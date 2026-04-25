# Lotview SaaS — Deploy to Render + GitHub (Complete Guide)

Deploy Lotview to Render.com with auto-deployment from GitHub pushes.

---

## Prerequisites

1. **GitHub repo** with your Lotview code pushed to `main` branch
2. **Render account** at https://render.com (free tier works)
3. **Browserless.io token** for scraping (free tier: 1000 req/month)

---

## Step 1: Push to GitHub

```bash
# If you haven't already:
git init
git add .
git commit -m "Lotview production build"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/Lotview.git
git push -u origin main
```

---

## Step 2: Set Up Render (Blueprints — One-Click Deploy)

### Option A: Blueprint (Recommended)

1. Go to https://dashboard.render.com/blueprints
2. Click **"New Blueprint Instance"**
3. Connect your GitHub repo
4. Render reads `render.yaml` and creates:
   - ✅ `lotview-api` — Web service (API + static files)
   - ✅ `lotview-worker` — Background worker (schedulers + queues)
   - ✅ `lotview-db` — PostgreSQL 16 database
   - ✅ `lotview-redis` — Redis cache
   - ✅ `lotview-daily-scrape` — Daily scrape cron job (6 AM UTC)
   - ✅ `lotview-carfax-refresh` — Hourly Carfax refresh cron job

### Option B: Manual Setup

If Blueprint doesn't work, create each service manually:

```
Dashboard → New + → Web Service → Docker
  Name: lotview-api
  Root Directory: .
  Dockerfile Path: ./Dockerfile.render
  Plan: Standard ($7/month minimum)
  
Dashboard → New + → Worker → Docker  
  Name: lotview-worker
  Root Directory: .
  Dockerfile Path: ./Dockerfile.render
  Docker Command: node dist/index-worker.js
  
Dashboard → New + → PostgreSQL
  Name: lotview-db
  PostgreSQL Version: 16
  
Dashboard → New + → Redis
  Name: lotview-redis
  
Dashboard → New + → Cron Job
  Name: lotview-daily-scrape
  Schedule: 0 6 * * *
  Command: node dist/scripts/run-daily-scrape.js
```

---

## Step 3: Set Environment Variables

### In Render Dashboard → lotview-api → Environment:

**Auto-set by Render (don't change):**
```
DATABASE_URL=postgresql://lotview:...@lotview-db/...   ← Auto
REDIS_URL=redis://...@lotview-redis/...                  ← Auto
PORT=10000                                                ← Auto
```

**You must set these manually:**
```
JWT_SECRET=abc123...   # Generate: openssl rand -hex 32
OPENAI_API_KEY=sk-...   # From platform.openai.com
ANTHROPIC_API_KEY=sk-ant-...  # From console.anthropic.com
BROWSERLESS_TOKEN=...   # From browserless.io
GHL_CLIENT_ID=...       # From GoHighLevel app settings
GHL_CLIENT_SECRET=...   # From GoHighLevel app settings
```

### Copy from web to worker:

In `lotview-worker` Environment, click **"Add from Service"** and select `lotview-api` for:
- `JWT_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

---

## Step 4: Configure GitHub Secrets

For auto-deployment, add these to your GitHub repo:

```bash
# Go to: GitHub → Settings → Secrets and variables → Actions → New repository secret

Name: RENDER_API_KEY
Value: rnd_xxxxxxxxxxxxxxxx   # From Render Dashboard → Account Settings → API Keys

Name: RENDER_WEB_SERVICE_ID  
Value: srv-xxxxxxxxxxxxxxxx   # From Render Dashboard → lotview-api → Settings → copy service ID

Name: RENDER_WORKER_SERVICE_ID
Value: srv-xxxxxxxxxxxxxxxx   # From Render Dashboard → lotview-worker → Settings → copy service ID
```

---

## Step 5: First Deploy

### Trigger manually:
```bash
git commit --allow-empty -m "Trigger Render deploy"
git push origin main
```

### Or wait for automatic deploy on push.

### Monitor in Render Dashboard:
- Logs: https://dashboard.render.com/web/srv-xxx
- Build logs appear in "Deploy" tab
- Green dot = healthy, Red dot = failing

---

## Step 6: Verify Deployment

```bash
# Check health
curl https://lotview-api.onrender.com/api/health
# → {"status":"healthy","service":"lotview-api"}

# Check readiness
curl https://lotview-api.onrender.com/api/ready
# → {"status":"ready","checks":{...}}

# Check version
curl https://lotview-api.onrender.com/api/version

# Seed database
curl -X POST https://lotview-api.onrender.com/api/super-admin/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"YourSecurePassword2026!"}'
```

---

## What Gets Deployed

| Service | Type | Purpose | Plan |
|---------|------|---------|------|
| `lotview-api` | Web | Express API + React SPA | Standard ($7/mo) |
| `lotview-worker` | Worker | Schedulers + BullMQ queues | Starter ($7/mo) |
| `lotview-db` | PostgreSQL | Main database | Standard ($15/mo) |
| `lotview-redis` | Redis | Cache + sessions + queues | Starter ($5/mo) |
| `lotview-daily-scrape` | Cron | Daily inventory scrape | Free |
| `lotview-carfax-refresh` | Cron | Hourly Carfax refresh | Free |

**Total: ~$34/month** for full production stack.

---

## Auto-Deploy Behavior

```
You: git push origin main
    ↓
GitHub Actions: .github/workflows/render-deploy.yml
    ↓
1. Lint & Type Check
2. Run Tests (30-vehicle scraper test)
3. Build Docker Image
4. Deploy to Render (auto)
5. Health Check (auto)
    ↓
Render: Rolling deploy with zero downtime
    ↓
Live: https://lotview-api.onrender.com
```

---

## Troubleshooting

### "Build failed"
```bash
# Check Render logs → Deploy tab
# Common fix: ensure package-lock.json is committed
git add package-lock.json && git commit -m "Add lockfile" && git push
```

### "Health check failed"
```bash
# Check: is /api/health responding?
curl https://lotview-api.onrender.com/api/health
# If 404: routes may not be registered. Check server/index-prod.ts
```

### "Database connection failed"
```bash
# Verify DATABASE_URL is set in Render Dashboard
# Test: psql $DATABASE_URL -c "SELECT 1"
```

### "Scraper gets 403"
```bash
# Normal — Cloudflare blocks cloud IPs
# Fix: Set BROWSERLESS_TOKEN in environment variables
# Get free token: https://www.browserless.io/pricing
```

---

## Render Files Reference

| File | Purpose |
|------|---------|
| `render.yaml` | Blueprint defining all services |
| `Dockerfile.render` | Optimized Docker image for Render |
| `.github/workflows/render-deploy.yml` | CI/CD pipeline |
| `scripts/render-start.sh` | Container startup script |
| `scripts/render-build.sh` | Build phase script |
| `.env.render` | Environment variable template |
| `server/scripts/run-daily-scrape.ts` | Cron: daily inventory scrape |
| `server/scripts/run-carfax-refresh.ts` | Cron: hourly Carfax refresh |

---

*Deploy with confidence. Render handles the infrastructure, you handle the dealerships.*
