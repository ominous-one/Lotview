# Dealership Management SaaS Platform

Enterprise-grade multi-tenant dealership management system with vehicle inventory, CRM, AI-powered features, and comprehensive operational tools.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Management](#database-management)
- [Authentication](#authentication)
- [Multi-Tenancy](#multi-tenancy)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Production Deployment](#production-deployment)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Tech Stack
- **Frontend**: React 19, TypeScript, TailwindCSS, Radix UI
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT-based with bcrypt password hashing
- **AI Integration**: OpenAI for vehicle descriptions, chat, and CRM insights
- **Email**: Resend for transactional emails (password reset, invitations)
- **Storage**: Object storage for images and assets

### Key Features
- Multi-tenant architecture with dealership isolation
- Vehicle inventory management with VIN decoding
- CRM with contact management and activity tracking
- AI-powered content generation and chat
- Facebook Marketplace integration
- Staff invitation and role-based access control
- Self-service password reset flow

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database (provided by Replit)
- OpenAI API key (for AI features)
- Resend API key (for email features)

### Installation

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`.

### Build for Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Secret for session signing (min 32 chars) | `your-secure-secret-key` |
| `JWT_SECRET` | Secret for JWT signing (uses SESSION_SECRET if not set) | `your-jwt-secret` |

### AI Integration (Optional but Recommended)

| Variable | Description | Example |
|----------|-------------|---------|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI base URL (default: api.openai.com) | `https://api.openai.com/v1` |

### Email Integration (Optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key for transactional emails | `re_...` |

### Facebook Integration (Optional)

| Variable | Description | Example |
|----------|-------------|---------|
| `FACEBOOK_APP_ID` | Facebook App ID | `123456789` |
| `FACEBOOK_APP_SECRET` | Facebook App Secret | `abc123...` |
| `FACEBOOK_REDIRECT_URI` | OAuth redirect URI | `https://yourdomain.com/api/facebook/callback` |

### Object Storage (Managed by Replit)

| Variable | Description |
|----------|-------------|
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Bucket ID for file storage |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Paths for public assets |
| `PRIVATE_OBJECT_DIR` | Directory for private files |

### PostgreSQL (Managed by Replit)

| Variable | Description |
|----------|-------------|
| `PGHOST` | Database host |
| `PGPORT` | Database port |
| `PGUSER` | Database user |
| `PGPASSWORD` | Database password |
| `PGDATABASE` | Database name |

---

## Database Management

### Schema Push
Push schema changes to the database:
```bash
npm run db:push
```

### Force Push (Destructive)
Use with caution - may drop data:
```bash
npm run db:push --force
```

### Drizzle Studio (Local Development)
```bash
npx drizzle-kit studio
```

### Key Tables
- `dealerships` - Tenant/organization records
- `users` - User accounts with roles
- `vehicles` - Vehicle inventory
- `crm_contacts` - CRM contacts
- `crm_activities` - Contact activity history
- `staff_invites` - Pending staff invitations
- `password_reset_tokens` - Password reset tokens

---

## Authentication

### JWT-Based Authentication
- Tokens issued on login with 7-day expiration
- Tokens contain: userId, email, role, dealershipId
- Refresh via `/api/auth/me` endpoint

### User Roles
| Role | Description |
|------|-------------|
| `super_admin` | Platform-wide access |
| `manager` | Full dealership access |
| `sales` | Sales operations |
| `service` | Service operations |

### Password Reset Flow
1. User requests reset via `/api/auth/forgot-password`
2. Secure token sent via email (1-hour expiry)
3. Token validated via `/api/auth/reset-password/:token`
4. Password updated via `/api/auth/reset-password`

---

## Multi-Tenancy

### Tenant Resolution
Tenants are resolved in order:
1. JWT token `dealershipId` claim
2. `X-Tenant-ID` header
3. Subdomain parsing

### Data Isolation
- All queries scoped to tenant via middleware
- Cross-tenant access blocked at storage layer
- Super admins can access any tenant

---

## API Endpoints

### Health & Monitoring
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/ready` | GET | Readiness check with DB status |

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login and get JWT |
| `/api/auth/logout` | POST | Logout (client-side token removal) |
| `/api/auth/me` | GET | Get current user info |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/reset-password/:token` | GET | Validate reset token |
| `/api/auth/reset-password` | POST | Complete password reset |

### Vehicles
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vehicles` | GET | List vehicles |
| `/api/vehicles` | POST | Create vehicle |
| `/api/vehicles/:id` | GET | Get vehicle details |
| `/api/vehicles/:id` | PUT | Update vehicle |
| `/api/vehicles/:id` | DELETE | Delete vehicle |
| `/api/vehicles/decode-vin/:vin` | GET | Decode VIN |

### CRM
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/crm/contacts` | GET | List contacts |
| `/api/crm/contacts` | POST | Create contact |
| `/api/crm/contacts/:id` | PUT | Update contact |
| `/api/crm/activities` | GET | List activities |
| `/api/crm/tasks` | GET | List tasks |

---

## Testing

### Run Tests
Tests require a running server. Start the server first, then run tests:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run tests
npx tsx server/tests/tenant-isolation.test.ts
npx tsx server/tests/vin-appraisal.test.ts
npx tsx server/tests/ghl-sync.test.ts
```

### Test Files
- `tenant-isolation.test.ts` - Multi-tenant security tests
- `vin-appraisal.test.ts` - VIN decoding tests
- `ghl-sync.test.ts` - GHL integration tests
- `image-proxy.test.ts` - Image proxy tests
- `color-scoring.test.ts` - Color matching tests

---

## Monitoring & Health Checks

### Health Endpoint
```bash
curl http://localhost:5000/health
# Response: {"status":"ok","timestamp":"...","uptime":123.45}
```

### Readiness Endpoint
```bash
curl http://localhost:5000/ready
# Response: {"status":"ok","database":"connected","timestamp":"..."}
```

### Structured Logging
All logs output in JSON format with:
- `correlationId` - Request tracking ID
- `timestamp` - ISO timestamp
- `level` - info/warn/error
- `message` - Log message
- `context` - Additional context (route, userId, etc.)

---

## Production Deployment

### Pre-Deployment Checklist

1. **Environment Variables**
   - [ ] `SESSION_SECRET` set to secure random value (32+ chars)
   - [ ] `DATABASE_URL` configured for production database
   - [ ] OpenAI and Resend API keys configured

2. **Database**
   - [ ] Run `npm run db:push` to sync schema
   - [ ] Verify all migrations applied

3. **Security**
   - [ ] Rate limiting enabled (default: on)
   - [ ] Helmet security headers enabled (default: on)
   - [ ] CORS configured for production domain

4. **Build**
   - [ ] Run `npm run build` successfully
   - [ ] TypeScript compilation passes (`npm run check`)

### Deployment Steps

```bash
# Build production bundle
npm run build

# Start production server
npm start
```

### Post-Deployment Verification

1. Check health endpoint: `curl https://yourdomain.com/health`
2. Check readiness: `curl https://yourdomain.com/ready`
3. Verify login flow works
4. Test password reset email delivery

---

## Security Considerations

### Password Security
- Passwords hashed with bcrypt (10 rounds)
- Minimum 8 character requirement
- Reset tokens hashed before storage

### Rate Limiting
- Auth endpoints: 5 requests/15 minutes per IP
- Sensitive operations: 3 requests/15 minutes per IP
- General API: Standard Express limits

### Headers
Helmet.js configured with:
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (production)

### Token Security
- JWT tokens expire in 7 days
- Password reset tokens expire in 1 hour
- Tokens invalidated on password change

---

## Troubleshooting

### Database Connection Issues
```bash
# Check database status
curl http://localhost:5000/ready

# Verify environment variables
echo $DATABASE_URL
```

### Authentication Issues
- Verify JWT_SECRET or SESSION_SECRET is set
- Check token expiration (7 days default)
- Ensure user account is active (`isActive: true`)

### Email Not Sending
- Verify RESEND_API_KEY is set
- Check Resend dashboard for delivery status
- Review server logs for email errors

### Multi-Tenant Isolation
- Verify dealershipId in JWT token
- Check X-Tenant-ID header if using header-based tenancy
- Ensure middleware is applied to routes

### Common Log Patterns
```bash
# Search for errors
grep -i error /tmp/logs/*.log

# Search for specific user
grep "user@email.com" /tmp/logs/*.log

# Search by correlation ID
grep "correlation-id-here" /tmp/logs/*.log
```

---

## Support

For issues or questions, review the application logs and health endpoints. The structured logging with correlation IDs makes it easy to trace requests through the system.
