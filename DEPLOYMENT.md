# LotView Deployment Guide

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  React SPA   │────▶│  Express API │────▶│  PostgreSQL  │
│  (Vite)      │     │  + Puppeteer │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                     ┌──────┴──────┐
                     │   Redis     │  (optional, future)
                     │   (cache)   │
                     └─────────────┘
```

The Express server serves both the API and the built React SPA from a single port (5000).

---

## 1. Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm

### Setup

```bash
# Clone the repo
git clone <repo-url> && cd lotview

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your local PostgreSQL credentials and API keys

# Push database schema
npm run db:push

# Start dev server (port 5000 with HMR)
npm run dev
```

### Chrome Extension (local)

```bash
cd chrome-extension
npm install
npm run build        # Dev build
npm test             # Run 256 tests
```

Load `chrome-extension/dist/` as unpacked extension in `chrome://extensions/`.

---

## 2. Docker (Local / Staging)

### Quick Start

```bash
# Copy env file
cp .env.example .env
# Fill in at minimum: SESSION_SECRET, AI_INTEGRATIONS_OPENAI_API_KEY

# Build and start all services
docker compose up --build -d

# Push database schema (first time)
docker compose exec app node -e "
  const { execSync } = require('child_process');
  execSync('npx drizzle-kit push', { stdio: 'inherit' });
"

# View logs
docker compose logs -f app

# Stop
docker compose down
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| `app`   | 5000 | Express API + React SPA + Puppeteer |
| `db`    | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 (future caching) |

### Health Checks

- `GET /health` - Basic liveness (is the process running?)
- `GET /ready` - Readiness (are DB and dependencies connected?)
- `GET /api/health` - Alias for `/health` (k8s convention)

### Persistent Volumes

- `pgdata` - PostgreSQL data
- `redisdata` - Redis AOF persistence
- `uploads` - User-uploaded files (logos, vehicle images)

---

## 3. Production Deployment

### Option A: Docker on a VPS (Recommended for starting out)

#### Server Requirements

- 2+ CPU cores, 4GB+ RAM (Puppeteer/Chromium needs memory)
- Ubuntu 22.04+ or Debian 12+
- Docker and Docker Compose installed

#### Steps

```bash
# 1. SSH into your server
ssh user@your-server

# 2. Clone the repo
git clone <repo-url> && cd lotview

# 3. Create production env file
cp .env.production.example .env
# Fill in ALL required values - especially:
#   SESSION_SECRET (openssl rand -hex 32)
#   DATABASE_URL
#   AI_INTEGRATIONS_OPENAI_API_KEY
#   EXTENSION_HMAC_SECRET (openssl rand -hex 32)

# 4. Build and start
docker compose up --build -d

# 5. Push database schema
docker compose exec app npx drizzle-kit push

# 6. Verify
curl http://localhost:5000/ready
```

#### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Use [Certbot](https://certbot.eff.org/) for free SSL certificates.

### Option B: Container Registry + Managed Service

The CI/CD pipeline (`.github/workflows/deploy.yml`) automatically builds and pushes Docker images to GitHub Container Registry on every push to `main`.

```bash
# Pull the latest image
docker pull ghcr.io/<org>/lotview:latest

# Run with your env file
docker run -d \
  --name lotview \
  -p 5000:5000 \
  --env-file .env \
  ghcr.io/<org>/lotview:latest
```

This image works with any container orchestrator: AWS ECS, Google Cloud Run, Azure Container Apps, Fly.io, Railway, etc.

---

## 4. Environment Variables

See `.env.example` for the full list with descriptions. Critical production variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | JWT signing key (min 32 chars) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Yes* | OpenAI API key for AI features |
| `RESEND_API_KEY` | Yes* | Email delivery (password reset, invites) |
| `FACEBOOK_APP_ID` | No | Facebook Marketplace integration |
| `EXTENSION_HMAC_SECRET` | No | Chrome extension auth signing |
| `SENTRY_DSN` | No | Error tracking |

*Required for full functionality; app starts without them but features are degraded.

---

## 5. Database Migrations

LotView uses Drizzle ORM with push-based migrations:

```bash
# Apply schema changes to database
npm run db:push

# Or via Docker
docker compose exec app npx drizzle-kit push
```

For production, review changes before pushing:

```bash
npx drizzle-kit generate   # Generate migration SQL
# Review the generated SQL
npx drizzle-kit push        # Apply
```

---

## 6. Monitoring

### Logs

In production, all logs are JSON-formatted for ingestion by log aggregators (Datadog, Loki, CloudWatch, etc.):

```json
{"timestamp":"2026-02-23T10:00:00.000Z","level":"info","source":"http","method":"GET","path":"/api/vehicles","status":200,"duration_ms":45}
```

Set `LOG_FORMAT=json` explicitly, or it defaults to JSON when `NODE_ENV=production`.

### Error Tracking

To enable Sentry, set `SENTRY_DSN` in your environment. The server already produces structured error logs with correlation IDs that Sentry can ingest.

### Health Monitoring

Configure your uptime monitor (UptimeRobot, Pingdom, etc.) to poll:
- `https://your-domain.com/health` for basic liveness
- `https://your-domain.com/ready` for full dependency checks

---

## 7. Chrome Extension

See [`chrome-extension/PUBLISHING.md`](chrome-extension/PUBLISHING.md) for Chrome Web Store submission instructions.

The deploy workflow automatically builds and archives the extension zip on every push to `main`. Download from GitHub Actions artifacts.

---

## 8. Backup & Recovery

### Database

```bash
# Backup
docker compose exec db pg_dump -U lotview lotview > backup-$(date +%Y%m%d).sql

# Restore
docker compose exec -T db psql -U lotview lotview < backup-20260223.sql
```

### Uploads

The `uploads` Docker volume contains user-uploaded files. Back it up:

```bash
docker run --rm -v lotview_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Puppeteer crashes in Docker | Ensure `--no-sandbox` flag is used; the Dockerfile installs Chromium and sets `PUPPETEER_EXECUTABLE_PATH` |
| `ECONNREFUSED` to database | Check `DATABASE_URL` and that PostgreSQL is running; use `docker compose logs db` |
| Extension HMAC errors | Ensure `EXTENSION_HMAC_SECRET` matches between server `.env` and extension config |
| Port 5000 in use | Change `PORT` in `.env` and update `docker-compose.yml` port mapping |
| OOM kills in container | Increase Docker memory limit to 4GB+; Puppeteer with Chromium needs ~1-2GB |
