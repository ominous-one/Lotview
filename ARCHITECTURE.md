# Lotview SaaS — Architecture Blueprint

## Executive Summary

Lotview is a multi-tenant SaaS platform for automotive dealership inventory management, AI-powered sales automation, and Facebook Marketplace integration. It replaces vAuto, LocalShift, and Shiftly with a modern, horizontally-scalable architecture.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  React SPA   │  │  Chrome Ext  │  │   Mobile     │  │   Public     │ │
│  │  (Vite)      │  │  (Vehicle    │  │   (PWA)      │  │   VDP Pages  │ │
│  │              │  │   Poster)    │  │              │  │              │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────┘
          │                 │                 │                 │
          └─────────────────┴─────────────────┴─────────────────┘
                              │ HTTPS / WSS
┌─────────────────────────────────────────────────────────────────────────┐
│                              EDGE LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Nginx (SSL Termination, Rate Limiting, Static Asset Caching)   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────┬───────────────────────────────┘
                                          │
┌─────────────────────────────────────────┴───────────────────────────────┐
│                              API LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Express.js Application (Stateless, Horizontally Scalable)        │ │
│  │                                                                     │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │ │
│  │  │   Auth      │ │  Vehicles   │ │   Scraping  │ │     AI      │  │ │
│  │  │   Router    │ │   Router    │ │   Router    │ │   Router    │  │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │ │
│  │  │  Facebook   │ │     GHL     │ │   Admin     │ │   Health    │  │ │
│  │  │   Router    │ │   Router    │ │   Router    │ │   Router    │  │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │ │
│  │                                                                     │ │
│  │  Middleware: Helmet, CORS, Rate Limit, Tenant Context, Logging    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────┬───────────────────────────────┘
                                          │
┌─────────────────────────────────────────┴───────────────────────────────┐
│                           SERVICE LAYER                                  │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │  Redis      │ │  BullMQ     │ │  Drizzle    │ │   JWT /     │     │
│  │  (Sessions, │ │  (Job       │ │  (ORM)      │ │   HMAC      │     │
│  │   Cache,    │ │   Queue)     │ │             │ │   Auth      │     │
│  │   Rate Lim) │ │             │ │             │ │             │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │  GHL Notif  │ │  Scrape     │ │  AI Cost    │ │  Vehicle    │     │
│  │  (Email/SMS)│ │  Validator  │ │  Tracker    │ │  Dedup      │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │  FB Ban     │ │  AI Posting │ │  Calendar   │ │  A/B Test   │     │
│  │  Recovery   │ │  Optimizer  │ │  Sync       │ │  Engine     │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │  Webhook    │ │  External   │ │  Photo      │ │  Feature    │     │
│  │  Verifier   │ │  API Guard  │ │  Guard      │ │  Flags      │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │  Scrape     │ │  Carfax     │ │  Admin      │                   │
│  │  Alerts     │ │  Browserless│ │  Dashboard  │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                          │
┌─────────────────────────────────────────┴───────────────────────────────┐
│                           DATA LAYER                                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL 16 (Multi-tenant, Row-level security per dealership)   │ │
│  │  - dealerships, users, vehicles, conversations                       │ │
│  │  - facebook_pages, posting_queue, appointments                      │ │
│  │  - ghl_accounts, api_keys, webhook_events                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Redis 7 (Cross-instance state, job queues, caches)                 │ │
│  │  - Sessions, nonce store, posting tokens                            │ │
│  │  - Rate limit counters, feature flag caches                         │ │
│  │  - BullMQ job queues (scrape, AI, notifications)                    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | SPA, PWA capability |
| **UI Components** | Radix UI + Tailwind | Accessible design system |
| **Backend** | Express.js 4 | API server |
| **Database** | PostgreSQL 16 + Drizzle ORM | Relational data, type-safe queries |
| **Cache/Queue** | Redis 7 + BullMQ | Sessions, rate limits, background jobs |
| **AI/LLM** | OpenAI + Anthropic Claude | Chat, sales responses, content |
| **Scraping** | Browserless.io + Cheerio | Cloud browser automation |
| **CRM** | GoHighLevel (GHL) | Lead management, SMS, email |
| **Social** | Facebook Graph API | Marketplace posting |
| **Auth** | JWT + bcryptjs + HMAC | Stateless authentication |
| **Storage** | Google Cloud Storage | Vehicle photos, documents |

---

## Multi-Tenancy Model

Each dealership is an isolated tenant:

- **Tenant Key**: UUID (`tenant_key`) — immutable identifier
- **Dealership ID**: Serial integer — foreign key on all tenant tables
- **Subdomain**: `slug.lotview.ai` — auto-provisioned routing
- **Custom Domain**: `inventory.dealername.com` — CNAME-based
- **Row-Level Security**: Every query filtered by `dealershipId`

---

## Security Architecture

### Authentication
- **JWT**: RS256-signed, 1h expiry, issuer/audience validation
- **HMAC**: Chrome extension requests signed with shared secret
- **OAuth**: GHL OAuth2 flow for CRM integration
- **Nonce**: Redis-backed single-use tokens for posting

### Authorization
- **RBAC**: `super_admin` → `master` → `admin` → `manager` → `salesperson`
- **Capabilities**: Granular permissions (e.g., `vehicles.manage`, `facebook.post`)
- **Impersonation**: Super admin can impersonate any user (15min expiry)

### Input Protection
- **Helmet**: CSP, HSTS, X-Frame, referrer policy
- **Rate Limiting**: Global (1000/15min), Auth (10/15min), Sensitive (5/hr)
- **Body Limits**: 1MB JSON, 1MB URL-encoded
- **SQL Injection**: Impossible via Drizzle ORM parameterized queries
- **XSS**: DOMPurify on all user content

### Data Protection
- **Encryption at Rest**: PostgreSQL native + application-level for tokens
- **Encryption in Transit**: TLS 1.3 enforced
- **Sensitive Logging**: Passwords, tokens, emails redacted from logs
- **PII Handling**: Phone/emails encrypted in database

---

## Scalability Design

### Horizontal Scaling
- **Stateless API**: JWT auth requires no session affinity
- **Shared Redis**: All instances connect to same Redis cluster
- **Shared PostgreSQL**: Connection pooling (50 web / 20 worker)
- **Read Replicas**: Analytics queries offloaded to replicas

### Vertical Scaling
- **Worker Separation**: Background jobs run on dedicated workers
- **Queue Prioritization**: Critical jobs (AI responses) ahead of bulk (scraping)
- **Circuit Breakers**: GHL API calls fail fast after 5 errors

### Database Optimization
- **Indexes**: Tenant-keyed, VIN, status, created_at
- **Partitioning**: vehicle_views by month, messenger_messages by conversation
- **Archival**: Soft-delete + 90-day purge for conversations

---

## Background Processing

### Schedulers (Worker Process)
| Scheduler | Frequency | Purpose |
|-----------|-----------|---------|
| Inventory Sync | Every 30 min | Scrape dealership websites |
| FB Marketplace | Every 2 hours | Auto-post queued vehicles |
| GHL Sync | Every hour | Two-way contact/appointment sync |
| Market Analysis | Daily | Price comparison, deal ratings |
| Competitive Report | Weekly | Area inventory analysis |
| Reengagement | Daily | Follow-up with cold leads |
| Notifications | Real-time | Email/SMS delivery |

### BullMQ Job Types
| Queue | Priority | Purpose |
|-------|----------|---------|
| `scrape` | 3 | Inventory scraping per dealership |
| `ai-response` | 1 | AI chat responses (highest) |
| `facebook-post` | 2 | Marketplace posting |
| `notification` | 1 | Email/SMS delivery |

---

## Integration Architecture

### GoHighLevel (GHL)
```
Inbound:  GHL Webhook → Webhook Verifier → Event Router → Action
Outbound: Action Queue → GHL API Service → Rate Limiter → GHL API
```
- **OAuth**: Standard OAuth2 flow with refresh tokens
- **Webhooks**: Signature verification + idempotency checks
- **Fallback**: Direct GHL API when OAuth tokens expire

### Facebook
```
Posting:  Vehicle → AI Optimizer → Template → FB Graph API → Result Tracking
Replies:  FB Webhook → Intent Detection → AI Response → Safety Check → Send
```
- **Ban Detection**: Rate tracking + error pattern analysis
- **Ramp-up**: Gradual posting increase after account issues
- **9-Layer Safety**: Content filter + manual approval for sensitive replies

### Scraping
```
Trigger:  Scheduler → Scrape Queue → Browserless.io / Cheerio → Validation → Storage
```
- **Cloud Browser**: Browserless.io for JavaScript-heavy sites
- **Local Fallback**: Cheerio for static HTML
- **Validation**: VIN checksum, price range, photo count
- **Deduplication**: VIN-based merge strategy

---

## Deployment Architecture

### Docker Compose (Single Host)
```
┌─────────────┐
│   Nginx     │
└──────┬──────┘
       │
┌──────┴──────┐
│    Web      │  ← Horizontally scalable
│   (App)     │
└─────────────┘
       │
┌──────┴──────┐     ┌─────────────┐
│   Worker    │────▶│   Redis     │
│  (Jobs)     │     └─────────────┘
└─────────────┘           │
       │                  │
┌──────┴──────────────────┴──────┐
│         PostgreSQL             │
└────────────────────────────────┘
```

### Kubernetes (Multi-Host)
```
┌─────────────────────────────────────────┐
│  Ingress Controller (SSL, Rate Limit)   │
└─────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───┴───┐         ┌─────┴────┐
│ Web   │         │  Web     │  ← HPA: 3-20 replicas
│ Pod 1 │         │  Pod 2   │
└───┬───┘         └─────┬────┘
    │                   │
    └─────────┬─────────┘
              │
┌─────────────┴─────────────┐
│      Worker Deployment    │  ← 2-5 replicas
│   (Schedulers + Queue)    │
└───────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───┴───┐         ┌─────┴────┐
│ Redis │         │PostgreSQL│  ← CloudSQL / RDS
│(ElastiCache)     │(Managed) │
└────────┘         └──────────┘
```

---

## Monitoring & Observability

### Metrics
| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| API Response Time | Express middleware | P95 > 500ms |
| Error Rate | Log aggregation | > 1% of requests |
| DB Connection Pool | pg.Pool events | > 80% utilization |
| Redis Memory | Redis INFO | > 80% maxmemory |
| Queue Depth | BullMQ | > 1000 pending |
| FB Account Health | Custom metric | Status != "healthy" |
| AI Cost / Day | Custom metric | > $50/dealership |

### Health Endpoints
| Endpoint | Use Case |
|----------|----------|
| `/api/health` | Load balancer health check |
| `/api/ready` | Kubernetes readiness probe |
| `/api/metrics` | Prometheus scraping |
| `/api/version` | Deployment verification |

---

## Disaster Recovery

### Backup Strategy
| Component | Frequency | Retention | Method |
|-----------|-----------|-----------|--------|
| PostgreSQL | Daily | 30 days | `pg_dump` + GCS |
| Redis | Real-time | AOF rewrite | Append-only file |
| Uploads | Real-time | Versioned | GCS Object Versioning |

### Recovery Procedures
1. **Database**: Restore from latest `pg_dump` to new instance
2. **Redis**: Restart with AOF replay
3. **Application**: Rolling restart via Docker Compose / K8s
4. **Full Failure**: Spin up new environment from IaC, restore DB

---

## Development Workflow

```
Feature Branch → PR → CI (lint + typecheck + test) → Merge → Staging → Prod
```

### CI/CD Pipeline
1. **Build**: `npm run build` (Vite + esbuild)
2. **Type Check**: `tsc --noEmit`
3. **Test**: `npm run test:server`
4. **Deploy**: Docker image push → Rolling update

### Environments
| Environment | URL | Data | Purpose |
|-------------|-----|------|---------|
| Local | `localhost:5000` | Dev DB | Feature development |
| Staging | `staging.lotview.ai` | Snapshot | Integration testing |
| Production | `app.lotview.ai` | Live | Customer-facing |

---

## API Design Principles

- **RESTful**: Standard HTTP methods, resource-based URLs
- **Versioned**: `/api/v1/` prefix (currently v1 implied)
- **Consistent**: `{ success, data, error, meta }` response envelope
- **Paginated**: `limit` + `offset` for collections
- **Filtered**: Query params for search/filter
- **Tenant-Scoped**: All routes require `dealershipId` context

---

## Future Roadmap

### Phase 2 (Q2 2026)
- **CarGurus Integration**: Price analysis, listing syndication
- **AutoTrader Integration**: Listing management
- **SMS Provider Fallback**: Twilio when GHL SMS fails

### Phase 3 (Q3 2026)
- **AI Video Generation**: Automated vehicle walk-around videos
- **Market Intelligence**: AI-powered pricing recommendations
- **Mobile App**: React Native for iOS/Android

### Phase 4 (Q4 2026)
- **White-label**: Full branding customization
- **Franchise Support**: OEM-specific integrations (Toyota, Honda)
- **Analytics Suite**: Business intelligence dashboards

---

## File Structure

```
lotview/
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Full stack orchestration
├── .env.template                  # Environment variable reference
├── package.json                   # Dependencies + scripts
├── DEPLOYMENT.md                  # Deployment guide
├── SERVICE_INTEGRATION_SUMMARY.md # Service wiring docs
│
├── client/                        # React SPA (Vite)
│   ├── src/
│   ├── index.html
│   └── vite.config.ts
│
├── server/                        # Express API
│   ├── app.ts                     # Express app setup (middleware)
│   ├── index-prod.ts              # Production entry point
│   ├── index-dev.ts               # Development entry point
│   ├── index-worker.ts            # Background worker entry
│   ├── db.ts                      # PostgreSQL connection pool
│   ├── auth.ts                    # JWT + HMAC authentication
│   ├── storage.ts                 # Database operations (god class)
│   ├── routes.ts                  # Legacy monolithic routes (18k lines)
│   │
│   ├── routes/                    # Modular routes (migration in progress)
│   │   ├── index.ts               # Router mounting hub
│   │   ├── auth.ts                # Authentication routes
│   │   ├── health.ts              # Health check endpoints
│   │   └── onboarding.ts          # Self-service signup
│   │
│   ├── services/                  # Business logic layer (20 services)
│   │   ├── index.ts               # Central export hub
│   │   ├── redis.ts               # Redis connection
│   │   ├── queue.ts               # BullMQ job queues
│   │   ├── rate-limit.ts          # Redis-backed rate limiters
│   │   ├── feature-flags.ts       # Per-dealership feature toggles
│   │   ├── ghl-notifications.ts   # GHL email/SMS
│   │   ├── scrape-validator.ts    # Scraped data validation
│   │   ├── vehicle-dedup.ts       # VIN-based deduplication
│   │   ├── ai-cost-tracker.ts     # Per-dealership AI cost tracking
│   │   ├── fb-ban-recovery.ts     # FB ban detection + ramp-up
│   │   ├── ai-posting-optimizer.ts # AI-optimized FB posts
│   │   ├── calendar-sync.ts       # Google/Outlook calendar sync
│   │   ├── ab-testing.ts          # A/B testing engine
│   │   ├── admin-dashboard.ts     # Admin analytics API
│   │   ├── webhook-verifier.ts    # Webhook signature verification
│   │   ├── external-api-guard.ts  # External API rate limiting
│   │   ├── photo-guard.ts         # Manual photo protection
│   │   ├── scrape-alerts.ts       # Proactive scraping alerts
│   │   ├── carfax-browserless.ts  # Cloud Carfax scraping
│   │   └── scheduler-integration.ts # Pipeline wiring
│   │
│   ├── utils/                     # Shared utilities
│   │   └── crypto.ts              # Password hashing, HMAC
│   │
│   ├── fb-replies/                # Facebook auto-reply system
│   ├── appointments/              # Appointment management
│   └── follow-ups/                # Follow-up task automation
│
├── shared/                        # Shared between client + server
│   ├── schema.ts                  # Drizzle ORM schema definitions
│   └── authz.ts                   # Role-based authorization
│
├── docker/                        # Docker configuration
│   ├── postgres/init/             # Database initialization
│   └── nginx/                     # Reverse proxy config
│
└── scripts/                       # Operational scripts
    └── production-preflight.ts    # Pre-deployment validation
```

---

*Document Version: 1.0*  
*Last Updated: 2026-04-25*
