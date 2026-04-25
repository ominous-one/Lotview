# Lotview SaaS — Production Deployment Guide

## Quick Start (5 minutes)

```bash
# 1. Clone and enter directory
git clone https://github.com/ominous-one/Lotview.git
cd Lotview

# 2. Configure environment
cp .env.template .env
# Edit .env with your secrets (see Configuration section)

# 3. Start everything
docker-compose up -d

# 4. Verify health
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready

# 5. View logs
docker-compose logs -f web
```

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│   Web App   │────▶│  PostgreSQL │
│  (Proxy)    │     │  (Express)  │     │   (Data)    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                     ┌─────┴─────┐
                     │   Redis   │
                     │ (Cache/   │
                     │  Queues)  │
                     └───────────┘
                           │
                     ┌─────┴─────┐
                     │  Worker   │
                     │(Schedulers│
                     │  + Jobs)  │
                     └───────────┘
```

---

## Prerequisites

- **Docker** 24.0+ and **Docker Compose** 2.20+
- **Node.js** 20+ (for local development)
- **PostgreSQL** 16+ (if not using Docker)
- **Redis** 7+ (if not using Docker)

---

## Configuration

### Required Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `JWT_SECRET` | JWT signing key | `openssl rand -hex 32` |
| `DATABASE_URL` | PostgreSQL connection | `postgres://user:pass@localhost:5432/lotview` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |

### Integration Variables

| Variable | Purpose | Required For |
|----------|---------|-------------|
| `GHL_CLIENT_ID` | GoHighLevel OAuth | CRM sync, SMS, email |
| `GHL_CLIENT_SECRET` | GoHighLevel OAuth | CRM sync, SMS, email |
| `OPENAI_API_KEY` | OpenAI API | AI chat, embeddings |
| `ANTHROPIC_API_KEY` | Claude API | Sales responses, follow-ups |
| `FACEBOOK_APP_ID` | Facebook App | Marketplace posting |
| `FACEBOOK_APP_SECRET` | Facebook App | Marketplace posting |
| `BROWSERLESS_TOKEN` | Browserless.io | Cloud scraping |

### Feature Flags

All feature flags default to `false`. Enable per-dealership via environment or admin dashboard:

| Flag | Description |
|------|-------------|
| `FEATURE_VEHICLE_DEDUP` | VIN-based deduplication on import |
| `FEATURE_CLOUD_CARFAX` | Cloud Carfax scraping |
| `FEATURE_AI_POSTING_OPTIMIZER` | AI-optimized FB Marketplace posts |
| `FEATURE_GHL_FALLBACK_SMS` | Direct GHL SMS fallback |
| `FEATURE_APPOINTMENT_REMINDERS` | Automated appointment reminders |

---

## Deployment Steps

### Option A: Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f web
docker-compose logs -f worker

# Restart
docker-compose restart web

# Stop everything
docker-compose down

# Stop and remove volumes (⚠️ destroys data)
docker-compose down -v
```

### Option B: Manual Deployment

```bash
# Install dependencies
npm ci

# Run database migrations
npm run db:push

# Build client and server
npm run build

# Start web server
npm start

# Start worker (in separate terminal)
npm run start:worker
```

### Option C: Cloud Platform (Replit)

```bash
# Replit already provisions PostgreSQL — just configure env
cp .env.template .env
# Set DATABASE_URL to Replit's built-in DB URL
# Set REDIS_URL to external Redis (Upstash, Redis Cloud)

# Build
npm run build

# Start
npm start
```

---

## Health Checks

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /api/health` | Load balancer check | `{"status":"healthy"}` |
| `GET /api/ready` | Deep readiness | `{"status":"ready"}` + DB/Redis/Queue checks |
| `GET /api/metrics` | Prometheus metrics | Plain text metrics |
| `GET /api/version` | Build info | Version, Node, platform |

---

## Monitoring

### Logs

```bash
# Web app logs
docker-compose logs -f web

# Structured JSON logs in production
docker-compose logs -f web | jq '{timestamp: .timestamp, level: .level, message: .message}'
```

### Key Metrics

- `lotview_uptime_seconds` — Process uptime
- `lotview_memory_heap_used_bytes` — Memory pressure
- Database connection pool utilization
- Redis connection status
- Queue depth (BullMQ)

### Alerts (Configure Webhooks)

Set these environment variables for automatic alerts:
- `ALERT_SLACK_WEBHOOK` — Slack notifications
- `ALERT_PAGERDUTY_KEY` — Critical alerts

---

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.yml — Scale web containers
docker-compose up -d --scale web=3
```

Requirements:
- Shared PostgreSQL (use connection pooling)
- Shared Redis (all instances connect to same Redis)
- Sticky sessions NOT required (stateless JWT auth)

### Database Scaling

- Read replicas for analytics queries
- Connection pooling via PgBouncer
- Partition large tables (vehicle_views, messenger_messages)

---

## Backup & Recovery

### Database

```bash
# Backup
docker-compose exec db pg_dump -U lotview lotview > backup_$(date +%Y%m%d).sql

# Restore
docker-compose exec -T db psql -U lotview lotview < backup_20260115.sql
```

### Redis

Redis uses AOF persistence. Data survives container restarts.

---

## Security Checklist

- [ ] `JWT_SECRET` is strong (≥32 random chars)
- [ ] `.env` is NOT committed to git
- [ ] Database uses strong password
- [ ] Redis is not exposed publicly (bind to 127.0.0.1)
- [ ] CORS origins are explicitly configured
- [ ] Rate limiting enabled (default: 1000 req/15min)
- [ ] HTTPS enforced in production
- [ ] Helmet security headers enabled
- [ ] Non-root Docker user (`lotview:lotview`)
- [ ] Sensitive data redacted from logs

---

## Troubleshooting

### Database connection fails

```bash
# Verify PostgreSQL is running
docker-compose ps db
docker-compose logs db

# Test connection
docker-compose exec db pg_isready -U lotview
```

### Redis connection fails

```bash
# Verify Redis is running
docker-compose exec redis redis-cli ping
```

### Build fails

```bash
# Clean and rebuild
rm -rf dist node_modules
npm ci
npm run build
```

### Schedulers not running

```bash
# Check worker is running
docker-compose ps worker
docker-compose logs worker

# Verify env var
LOTVIEW_ENABLE_SCHEDULERS=true
LOTVIEW_SCHEDULER_PROCESS=worker
```

---

## Support

- **Health Issues**: Check `/api/ready` for component status
- **Build Issues**: Run `npm run check` for TypeScript errors
- **Integration Issues**: Run pre-flight check: `npx tsx scripts/production-preflight.ts`
