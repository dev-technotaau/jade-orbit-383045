# Build Stage
FROM node:22-alpine AS builder
WORKDIR /app
# Copy package files
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Build-time env vars — baked into Next.js static output by `npm run build`
# Passed via --build-arg in CI/CD (see .github/workflows/cd.yml)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_LINKEDIN_CLIENT_ID
ARG NEXT_PUBLIC_WEBAUTHN_RP_ID
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_GTM_ID
ARG NEXT_PUBLIC_FB_PIXEL_ID
# Behavioural analytics (free)
ARG NEXT_PUBLIC_CLARITY_ID
ARG NEXT_PUBLIC_CONTENTSQUARE_ID
# Ad pixels — retargeting + conversion
ARG NEXT_PUBLIC_LINKEDIN_PARTNER_ID
ARG NEXT_PUBLIC_PINTEREST_TAG_ID
ARG NEXT_PUBLIC_REDDIT_PIXEL_ID
ARG NEXT_PUBLIC_TWITTER_PIXEL_ID
ARG NEXT_PUBLIC_TIKTOK_PIXEL_ID
ARG NEXT_PUBLIC_QUORA_PIXEL_ID
ARG NEXT_PUBLIC_BING_UET_TAG_ID
ARG NEXT_PUBLIC_SNAP_PIXEL_ID
# Product analytics
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
# Cloudflare Web Analytics manual beacon
ARG NEXT_PUBLIC_CF_BEACON_TOKEN
# Adobe Experience Platform Launch (optional, paid)
ARG NEXT_PUBLIC_ADOBE_LAUNCH_URL
# Last-modified site timestamp — CI populates this from
# `git log -1 --format=%cI` so the site's <meta name="last-modified">
# and `article:modified_time` reflect the actual commit date of every
# deploy. Empty in local builds → SEO_CONFIG falls back to its static
# default (only matters for prod-style image testing).
ARG NEXT_PUBLIC_SITE_LAST_MODIFIED
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ENABLE_MOCK_DATA
ARG NEXT_PUBLIC_MAINTENANCE_MODE
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_R2_PUBLIC_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_NOMINATIM_BASE_URL
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
# Raise the V8 old-space limit for the build.
#
# `next build` OOM'd here with "FATAL ERROR: Reached heap limit Allocation
# failed - JavaScript heap out of memory" (exit 134 / SIGABRT). Node picks a
# default max-old-space from available memory, which is below what prerendering
# this app now needs.
#
# It got heavier for a specific reason: MaintenanceGate used to short-circuit
# every route to a spinner during render, so prerendering produced trivial
# output. Removing that (so crawlers get real HTML) means each route now
# renders its full component tree at build time. Correct behaviour, higher peak
# memory — so the limit has to be raised rather than the fix reverted.
#
# Set as ENV, not inline, so it also covers any other node invocation in this
# stage. Not set in package.json: `NODE_OPTIONS=... next build` is POSIX-only
# syntax and would break local Windows builds (cross-env is not a dependency).
ENV NODE_OPTIONS=--max-old-space-size=4096

# Sentry token mounted as secret, not baked into layer
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/SENTRY_AUTH_TOKEN 2>/dev/null) \
    npm run build

# Production Stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
