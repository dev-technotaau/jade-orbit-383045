# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Skip Puppeteer's bundled-Chrome download during `npm ci`. We use the
# system Chromium installed via apt in the production stage instead, so
# the ~300 MB download into the build cache would be pure waste.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy package files and prisma schema
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev for build step)
# postinstall script runs prisma generate automatically
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript (Sentry token mounted as secret, not baked into layer)
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/SENTRY_AUTH_TOKEN 2>/dev/null) \
    npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Production stage
FROM node:22-slim AS production

WORKDIR /app

# Install system Chromium for Puppeteer (used by the invoice-pdf
# renderer for tax invoices, receipts, credit notes, proformas).
# `--no-install-recommends` keeps the image lean; `chromium` already
# pulls all its runtime libs (nss, freetype, libcups, libgbm, etc.) as
# `Depends`. Fonts are explicit because Chromium recommends but doesn't
# depend on any — without them PDF text renders as boxes.
#   - fonts-liberation: standard Latin (Arial / Times / Courier metric-compatible)
#   - fonts-noto-color-emoji: emoji glyphs (sparkle/checkmark icons in templates)
# ca-certificates is needed for outbound HTTPS (R2 uploads, webhooks).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         chromium \
         fonts-liberation \
         fonts-noto-color-emoji \
         ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium instead of its bundled
# binary (which we explicitly skipped downloading in the builder).
# `/usr/bin/chromium` is the canonical Debian install location for the
# `chromium` apt package.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create non-root user (Debian-style: groupadd + useradd with home dir
# so Chromium has a writable HOME for its temp/profile files).
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin nodejs

# Copy built files
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/prisma.config.js ./
COPY --from=builder --chown=nodejs:nodejs /app/certs ./certs

# Create writable directories for non-root user
RUN mkdir -p uploads logs && chown nodejs:nodejs uploads logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server
CMD ["node", "dist/index.js"]
