# Claude Code Build Prompt - LotView Backend

Build the complete LotView backend in this directory. This is a Node.js + Express + TypeScript backend for auto-posting vehicle listings to Facebook Marketplace.

## What to Build

### 1. Initialize Project
```bash
npm init -y
npm install express cors helmet morgan jsonwebtoken bcryptjs socket.io bull ioredis @prisma/client puppeteer dotenv zod
npm install -D typescript @types/express @types/cors @types/jsonwebtoken @types/bcryptjs @types/node prisma ts-node nodemon
npx tsc --init
npx prisma init
```

### 2. Database Schema (prisma/schema.prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  listings     Listing[]
  @@index([email])
}

model Listing {
  id                      String    @id @default(cuid())
  userId                  String
  user                    User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title                   String
  description             String?
  price                   Float
  mileage                 Int?
  year                    Int?
  make                    String?
  model                   String?
  color                   String?
  condition               String?
  status                  String    @default("active")
  isAutoPostFacebook      Boolean   @default(false)
  isAutoPostCraigslist    Boolean   @default(false)
  facebookUrl             String?
  craigslistUrl           String?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  messages                Message[]
  appointments            Appointment[]
  autoPosts               AutoPost[]
  pricingHistory          PricingHistory[]
  @@index([userId, status])
  @@index([createdAt])
}

model Message {
  id              String    @id @default(cuid())
  listingId       String
  listing         Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  fromName        String?
  body            String
  aiReply         String?
  aiReplySentAt   DateTime?
  createdAt       DateTime  @default(now())
  @@index([listingId, createdAt])
}

model Appointment {
  id            String   @id @default(cuid())
  listingId     String
  listing       Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  contactName   String?
  contactEmail  String?
  contactPhone  String?
  scheduledDate DateTime
  status        String   @default("pending")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([listingId, scheduledDate])
}

model AutoPost {
  id            String    @id @default(cuid())
  listingId     String
  listing       Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  platform      String
  externalUrl   String?
  status        String    @default("pending")
  errorMessage  String?
  attemptCount  Int       @default(0)
  maxAttempts   Int       @default(3)
  lastAttemptAt DateTime?
  nextRetryAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@index([listingId, platform, status])
  @@index([status, nextRetryAt])
}

model PricingHistory {
  id        String   @id @default(cuid())
  listingId String
  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  oldPrice  Float?
  newPrice  Float
  reason    String?
  createdAt DateTime @default(now())
  @@index([listingId, createdAt])
}

model FailedJob {
  id           String   @id @default(cuid())
  jobType      String
  listingId    String?
  data         Json
  error        String
  stackTrace   String?
  attemptCount Int
  createdAt    DateTime @default(now())
  @@index([jobType, createdAt])
}
```

### 3. Backend Structure

```
src/
├── index.ts              # Express server + Socket.io + Bull queue setup
├── config.ts             # Environment variables
├── middleware/
│   ├── auth.ts           # JWT verification middleware
│   ├── errorHandler.ts   # Global error handler
│   ├── rateLimit.ts      # Rate limiting
│   └── validate.ts       # Zod validation middleware
├── routes/
│   ├── auth.ts           # POST /api/auth/register, POST /api/auth/login
│   ├── listings.ts       # GET/POST /api/listings, GET/PATCH/DELETE /api/listings/:id
│   ├── messages.ts       # GET /api/listings/:id/messages
│   └── health.ts         # GET /api/health
├── services/
│   ├── database.ts       # Prisma client singleton
│   ├── autoPoster.ts     # Puppeteer Facebook Marketplace posting
│   ├── messageFetcher.ts # Stub for future message fetching
│   └── aiAgent.ts        # Stub for future AI replies
├── jobs/
│   ├── queue.ts          # Bull queue setup
│   ├── autoPost.ts       # Auto-post job processor
│   └── fetchMessages.ts  # Message fetch job processor (stub)
├── websocket/
│   └── index.ts          # Socket.io event emitter
└── utils/
    ├── errors.ts         # Custom error classes
    └── logger.ts         # Structured logging
```

### 4. Key Implementation Details

#### Authentication (routes/auth.ts)
- POST /api/auth/register: email + password → bcrypt hash → store in DB → return JWT
- POST /api/auth/login: email + password → verify bcrypt → return JWT
- JWT secret from env, expires in 24h
- Zod validation on both endpoints

#### Listings (routes/listings.ts)
- GET /api/listings: Return all listings for authenticated user
- POST /api/listings: Create listing, if isAutoPostFacebook=true → queue auto-post job
- GET /api/listings/:id: Return single listing with auto-post status
- PATCH /api/listings/:id: Update listing fields
- DELETE /api/listings/:id: Soft delete (set status="deleted")

#### Auto-Poster (services/autoPoster.ts)
- Launch Puppeteer with user data dir (to reuse Facebook session)
- Navigate to https://www.facebook.com/marketplace/create/vehicle
- Fill form fields: title, price, year, make, model, mileage, condition, description
- Use flexible selectors (try multiple, fall back)
- Submit form
- Extract listing URL from final page
- Return { success: true, url } or throw RetryableError / PermanentError

#### WebSocket (websocket/index.ts)
- Authenticate connections via JWT
- Emit events: listing:created, listing:posted, listing:failed, message:received
- Room-based: each user gets their own room (userId)

#### Job Queue (jobs/queue.ts + jobs/autoPost.ts)
- Bull queue named "auto-post"
- Process: call autoPoster.postToFacebook(listing)
- On success: update AutoPost status="success", emit listing:posted
- On failure: increment attemptCount, if < maxAttempts retry with backoff, else mark failed
- Backoff: exponential (5s, 30s, 5min)

### 5. Environment Variables (.env.example)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lotview
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-in-production
PORT=3000
NODE_ENV=development
```

### 6. Docker Compose (docker-compose.yml)
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: lotview
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
volumes:
  pgdata:
```

### 7. Scripts (package.json)
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:push": "prisma db push",
    "db:generate": "prisma generate",
    "test": "jest"
  }
}
```

## CRITICAL: The auto-poster (services/autoPoster.ts) MUST actually work with Puppeteer against Facebook Marketplace. Use real selectors, handle DOM changes with fallbacks, implement proper error handling with RetryableError and PermanentError classes.

## Build everything. Make it compile. Make it run. Production quality code with proper error handling, logging, types, and validation throughout.

When completely finished, run this command to notify me:
openclaw system event --text "Done: Built LotView backend with Express, Prisma, Puppeteer auto-poster, Bull queue, Socket.io WebSocket" --mode now
