# ─── Multi-stage Dockerfile for Lotview SaaS ───
# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts

# Stage 2: Builder
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# Stage 3: Production Runner
FROM node:20-alpine AS runner
RUN apk add --no-cache curl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user for security
RUN addgroup --system --gid 1001 lotview && \
    adduser --system --uid 1001 --ingroup lotview lotview

# Copy only necessary files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Shared schema needed at runtime for Drizzle
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server

# Drizzle config if present
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts 2>/dev/null || true

# Scripts
COPY --from=builder /app/scripts ./scripts 2>/dev/null || true

# Set proper ownership
RUN chown -R lotview:lotview /app
USER lotview

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fs http://localhost:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
