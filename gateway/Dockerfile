# QRClaw Gateway — Multi-stage production Dockerfile
#
# NOTE: build context MUST be the repo root, NOT gateway/.
# The gateway tsconfig includes ../shared/contracts/**/*.ts (SSoT for WS
# schemas), so the build stage needs access to the sibling shared/ tree.
#
# Build:  docker build -f gateway/Dockerfile -t qrclaw-gateway .
# Run:    docker run -p 3001:3001 --env-file .env.production qrclaw-gateway
# Compose (from gateway/): docker compose up -d   (uses context: .. )

# ─── Stage 1: Build ──────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app/gateway

# Install gateway deps first (layer cache)
COPY gateway/package.json gateway/package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy gateway source
COPY gateway/tsconfig.json ./
COPY gateway/src/ ./src/

# Copy shared contracts SSoT — required by gateway/tsconfig include
# tsconfig has rootDir: ".." and include: "../shared/contracts/**/*.ts",
# so shared/ must live at /app/shared/ (sibling of /app/gateway/).
COPY shared/ /app/shared/

# Install shared's own deps (zod) so tsc can resolve `from 'zod'` inside
# shared/contracts/** via normal NodeNext module walk.
RUN cd /app/shared && npm ci --ignore-scripts

RUN npm run build

# ─── Stage 2: Production ─────────────────────────────────
FROM node:22-alpine AS runtime

# Security: non-root user
RUN addgroup -S qrclaw && adduser -S qrclaw -G qrclaw

WORKDIR /app/gateway

# Production deps only (shared/ has no runtime deps of its own)
COPY gateway/package.json gateway/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output (dist/gateway/src/** + dist/shared/contracts/**)
COPY --from=builder /app/gateway/dist ./dist

# Copy PM2 config
COPY gateway/ecosystem.config.cjs ./

# Create log directory
RUN mkdir -p logs && chown -R qrclaw:qrclaw /app

# Switch to non-root
USER qrclaw

# Expose gateway port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start with Node directly (PM2 cluster managed via docker-compose replicas)
CMD ["node", "dist/gateway/src/server.js"]
