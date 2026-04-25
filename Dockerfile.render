# ─── Lotview SaaS — Render-Optimized Dockerfile ───
# Multi-stage build optimized for Render.com's infrastructure
#
# Build: docker build -f Dockerfile.render -t lotview .
# Run:   docker run -p 10000:10000 lotview

# ─── Stage 1: Dependencies ───
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ─── Stage 2: Build ───
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ─── Stage 3: Production ───
FROM node:20-alpine AS runner
RUN apk add --no-cache curl
WORKDIR /app

ENV NODE_ENV=production
# Render sets PORT=10000 by default
ENV PORT=10000

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server

# Copy scripts
COPY --from=builder /app/scripts ./scripts

# Create non-root user
RUN addgroup --system --gid 1001 lotview && \
    adduser --system --uid 1001 --ingroup lotview lotview && \
    chown -R lotview:lotview /app
USER lotview

EXPOSE 10000

# Health check for Render
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fs http://localhost:${PORT}/api/health || exit 1

# Default: run web server (worker overrides via dockerCommand in render.yaml)
CMD ["node", "dist/index.js"]
