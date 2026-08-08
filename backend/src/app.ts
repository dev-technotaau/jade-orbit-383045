// Sentry must be imported first before any other modules
// CI trigger: re-run after Sentry token rotation (2026-05-11)
// Build marker: WhatsApp release image rebuild (2026-06-29)
import './instrument';
import type { Application, Request, Response } from 'express';
import express, { Router } from 'express';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import hpp from 'hpp';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import logger from './config/logger';
import healthRoutes from './routes/health.routes';
import metricsRoutes, {
  httpRequestDuration,
  httpRequestsTotal,
  activeConnections,
} from './routes/metrics.routes';
import requestId from './middleware/request-id';
import { requireAppPassword } from './middleware/app-password';
import { isBrowserRequest, renderRootPage, renderNotFoundPage } from './utils/pretty-page';
// Audit middleware applied per-route in admin.routes.ts

const app: Application = express();

// API v1 Router (for versioning)
const apiV1Router = Router();

// Trust proxy - required when behind Nginx/load balancer
app.set('trust proxy', 1);

import { env } from './config/env';

import { xssSanitize } from './middleware/xss-sanitize';
import { enforceContentType } from './middleware/content-type';
import { ddosProtection } from './middleware/ddos-protection';
import { waf } from './middleware/waf';
import { Role } from '@prisma/client';

// Security middleware
app.use(requestId()); // Add request ID for tracing
app.use(ddosProtection()); // DDoS protection (Redis-backed per-IP rate tracking)
app.use(waf()); // WAF rules (SQL injection, path traversal, exploit probes)

// Helmet with strict Content Security Policy (CSP) & HSTS
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'", 'https://challenges.cloudflare.com'], // Allow Cloudflare Turnstile
        frameSrc: ["'self'", 'https://challenges.cloudflare.com'], // Allow Turnstile iframe
        frameAncestors: ["'none'"], // Modern CSP3 replacement for X-Frame-Options: DENY
        imgSrc: [
          "'self'",
          'data:',
          'https://res.cloudinary.com',
          'https://assets.hireadda.in', // R2 custom domain
          'https://hireadda.in', // wordmark logo loaded by /api/* HTML pretty-pages
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        reportUri: ['/api/csp-report'],
        reportTo: ['csp-endpoint'],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Reporting API v1 endpoint header (modern browsers use this instead of report-uri)
app.use((_req: Request, res: Response, next) => {
  res.setHeader('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"');
  next();
});

app.use(hpp()); // Prevent HTTP Parameter Pollution

// CORS configuration with preflight caching
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',');

      // Allow requests with no origin (health checks, server-to-server, curl)
      if (!origin) {
        callback(null, true);
      } else if (allowedOrigins === '*') {
        callback(null, true);
      } else if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    maxAge: 86400, // Cache preflight responses for 24 hours
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
  })
);

// Rate limiting
import { apiLimiter } from './middleware/rate-limit';

// ----------------------------------------------------------
// WhatsApp (Meta) webhook — MUST be mounted BEFORE the global JSON parser (so
// the raw bytes survive X-Hub-Signature-256 HMAC verification) AND BEFORE the
// API rate limiter: Meta bursts delivery/read status callbacks during bulk
// campaigns; a 429 from the per-IP limiter would make Meta retry/back off and
// can get the webhook disabled. CSRF is bypassed (the signature is the auth).
// GET handles Meta's verification handshake.
// ----------------------------------------------------------
import { whatsappWebhookRawBody } from './middleware/whatsapp-webhook-rawbody';
import {
  verifyWhatsappWebhook,
  handleWhatsappWebhook,
} from './controllers/whatsapp-webhook.controller';
app.get('/api/v1/webhooks/whatsapp', verifyWhatsappWebhook);
app.post('/api/v1/webhooks/whatsapp', whatsappWebhookRawBody(), handleWhatsappWebhook);

// ----------------------------------------------------------
// Public WhatsApp short-link click redirect — mounted BEFORE the API rate
// limiter (it lives outside `/api`, but kept here next to the other public,
// limiter-exempt routes). Records the click (best-effort) then 302s to the
// target URL; unknown / failed codes return a plain 404. No auth — these are
// the public links embedded in outbound campaign messages.
// ----------------------------------------------------------
import { recordClick } from './services/whatsapp-shortlink.service';
app.get('/l/:code', async (req: Request, res: Response) => {
  try {
    const url = await recordClick(String(req.params.code), {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    if (url) {
      res.redirect(302, url);
    } else {
      res.status(404).send('Link not found');
    }
  } catch {
    res.status(404).send('Link not found');
  }
});

// ----------------------------------------------------------
// Public email tracking + unsubscribe endpoints — open pixel, click redirect,
// and RFC 8058 one-click unsubscribe. Mounted here (BEFORE CSRF + the API rate
// limiter) next to the other public webhook routes; covered by the ingress
// ModSecurity `/api/v1/webhooks/` exemption. No auth — these are the tracking
// URLs embedded in outbound campaign mail (HMAC-signed tokens are the guard).
// ----------------------------------------------------------

// ----------------------------------------------------------
// Twilio SMS delivery receipts — mounted HERE, before the API rate limiter
// and the CSRF layer, because Twilio has no credential to present. The
// handler verifies the X-Twilio-Signature instead.
//
// Its own urlencoded parser: Twilio POSTs application/x-www-form-urlencoded
// and the global parser is mounted further down, so without this req.body
// would be empty and every receipt silently ignored.
// ----------------------------------------------------------
// Apply rate limits
app.use('/api', apiLimiter);

// ----------------------------------------------------------
// Razorpay webhook — MUST be mounted BEFORE the global JSON parser so
// the raw bytes survive HMAC verification. CSRF is bypassed (signature is
// the auth). Idempotent at the DB layer (RazorpayWebhookEvent.razorpayEventId).
// ----------------------------------------------------------

// WhatsApp outbound proxy (optional Chatwoot bridge) — own JSON parser, gated by
// the X-Bridge-Secret header. Lets a self-hosted Chatwoot send through us.
import { handleOutboundProxy } from './controllers/whatsapp-bridge.controller';
app.post(
  '/api/v1/whatsapp-proxy/:phoneNumberId/messages',
  express.json({ limit: '256kb' }),
  handleOutboundProxy
);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser()); // Cookie parser must be before CSRF

// Content-Type enforcement (must run AFTER body parsing)
app.use(enforceContentType());

// XSS sanitization (must run AFTER body parsing so req.body exists)
app.use(xssSanitize());

// Compression
app.use(compression());

// Request timeout (30s for normal requests)
import { requestTimeout } from './middleware/timeout';
app.use(requestTimeout(30000));

// Structured request logging with correlation ID and duration
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms [${req.id}]`;
    if (res.statusCode >= 500) {
      logger.error(logData);
    } else if (res.statusCode >= 400) {
      logger.warn(logData);
    } else {
      logger.info(logData);
    }
  });
  next();
});

// HTTP request logging (morgan — development only)
if (env.NODE_ENV === 'development') {
  app.use(
    morgan('dev', {
      stream: { write: (message) => logger.debug(message.trim()) },
    })
  );
}

// Swagger API docs (protected in production)
const swaggerSetup = swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Hire Adda API Docs',
});
if (env.NODE_ENV === 'production') {
  // Was protect + restrictTo(ADMIN, SUPER_ADMIN). With no users or roles, the
  // single app password is the only gate there is.
  app.use('/api-docs', requireAppPassword, swaggerUi.serve, swaggerSetup);
} else {
  app.use('/api-docs', swaggerUi.serve, swaggerSetup);
}

// CSP violation reporting endpoint (before CSRF so browser reports aren't blocked).
// The host app's controller went with the rest of its reporting stack; this logs
// and 204s, which is all a report sink has to do.
app.post(
  '/api/csp-report',
  express.json({
    type: ['application/csp-report', 'application/json', 'application/reports+json'],
  }),
  (req: Request, res: Response) => {
    logger.warn('CSP violation', { report: req.body });
    res.status(204).end();
  }
);

// CSRF Protection (stateless HMAC-signed token — no cookies needed for cross-origin)
// We only protect API routes, health check and docs are excluded
import { generateCsrfToken, doubleCsrfProtection } from './config/csrf';

// CSRF Token Endpoint (Frontend calls this to get the token)
app.get('/api/csrf-token', (req: Request, res: Response) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken });
});

// Public config endpoints (Frontend fetches to stay in sync with backend env)
import {
  getOtpExpiryMinutes,
  getOtpLength,
  getOtpMaxResendAttempts,
  getOtpResendCooldown,
  getPasswordMinLength,
  getPasswordMaxLength,
  getPasswordRequireUppercase,
  getPasswordRequireLowercase,
  getPasswordRequireNumber,
  getPasswordRequireSpecial,
  getMaxLoginAttempts,
  getAccountLockDuration,
  getSessionTimeout,
  getPasswordResetExpiryHours,
  getPasswordResetMaxAttempts,
  getMaxSessionsPerUser,
} from './config/env';

app.get('/api/config/otp', (_req: Request, res: Response) => {
  res.json({
    length: getOtpLength(),
    resendCooldown: getOtpResendCooldown(),
    expiry: getOtpExpiryMinutes() * 60,
    maxResendAttempts: getOtpMaxResendAttempts(),
  });
});

app.get('/api/config/security', (_req: Request, res: Response) => {
  res.json({
    password: {
      minLength: getPasswordMinLength(),
      maxLength: getPasswordMaxLength(),
      requireUppercase: getPasswordRequireUppercase(),
      requireLowercase: getPasswordRequireLowercase(),
      requireNumber: getPasswordRequireNumber(),
      requireSpecial: getPasswordRequireSpecial(),
    },
    account: {
      maxLoginAttempts: getMaxLoginAttempts(),
      lockDurationMinutes: getAccountLockDuration(),
      sessionTimeoutHours: getSessionTimeout(),
      maxSessionsPerUser: getMaxSessionsPerUser(),
      passwordResetExpiryHours: getPasswordResetExpiryHours(),
      passwordResetMaxAttempts: getPasswordResetMaxAttempts(),
    },
  });
});

// Internal cluster-only routes — mounted BEFORE doubleCsrfProtection because
// AlertManager (and other in-cluster callers) can't carry a CSRF token. The
// /api/v1/internal/* prefix is locked down at the NetworkPolicy layer (only
// pods in `monitoring` / `hire-adda` namespaces can reach backend:5000), so
// CSRF on top would be both impossible and redundant.

// Protect all state-changing API routes
// Note: This applies to POST, PUT, DELETE, PATCH requests
apiV1Router.use(doubleCsrfProtection);

// Health check route
app.use('/health', healthRoutes);

// Prometheus metrics endpoint (no auth — restricted by NetworkPolicy in K3s)
app.use('/metrics', metricsRoutes);

// Prometheus HTTP metrics middleware
app.use((req: Request, res: Response, next) => {
  activeConnections.inc();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status: String(res.statusCode) };
    end(labels);
    httpRequestsTotal.inc(labels);
    activeConnections.dec();
  });
  next();
});

// Maintenance mode check (after health routes so probes still work)
import { maintenanceCheck } from './middleware/maintenance';
app.use('/api', maintenanceCheck());

// Passport initialization

// API v1 routes (versioning)
// Mount all versioned API routes under /api/v1
// alertmanagerRoutes is mounted earlier (before CSRF middleware) — see above.

// Mounted BEFORE `/super-admin` so its `/admin-control/*` paths are claimed
// by the dedicated (triple-locked) router rather than falling through to the
// general super-admin router.
import whatsappRoutes from './routes/whatsapp.routes';
// The only unauthenticated route: exchange the app password for a token.
import unlockRoutes from './routes/unlock.routes';
apiV1Router.use('/unlock', unlockRoutes);

apiV1Router.use('/whatsapp', whatsappRoutes);
// Company follow routes (mix of /companies/:slug/follow,
// /candidate/following/*, /employer/followers — kept in one file
// for cohesion, mounted at the API root).
// Company-review routes — covers /public/.../reviews, /candidate/reviews,
// /employer/reviews, /super-admin/reviews. One file, mixed prefixes.
// /internal/alertmanager is mounted earlier (above doubleCsrfProtection)

// API versioning headers
apiV1Router.use((_req, res, next) => {
  res.setHeader('API-Version', 'v1');
  res.setHeader('Deprecation', 'false');
  // When v2 is released, set: res.setHeader('Sunset', 'Sat, 01 Jan 2028 00:00:00 GMT');
  next();
});

app.use('/api/v1', apiV1Router);

// Root route — content-negotiated: browsers get a styled landing page,
// JSON clients (curl default, API consumers) keep the existing response.
app.get('/', (req: Request, res: Response) => {
  if (isBrowserRequest(req)) {
    res.type('html').send(renderRootPage());
    return;
  }
  res.json({
    message: 'Welcome to Hire Adda API',
    docs: '/api-docs',
  });
});

// Test Sentry route (dev only)
if (env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', (_req: Request, _res: Response) => {
    throw new Error('Sentry test error!');
  });
}

// API versioning enforcement — reject unsupported versions
app.all('/api/v:version/*path', (req: Request, res: Response) => {
  const version = req.params.version;
  if (version !== '1') {
    res.status(400).json({
      success: false,
      error: {
        message: `API version v${version} is not supported. Use /api/v1/`,
        code: 'UNSUPPORTED_API_VERSION',
      },
    });
    return;
  }
  res
    .status(404)
    .json({ success: false, error: { message: 'API route not found', code: 'ROUTE_NOT_FOUND' } });
});

// 404 handler for undefined API routes
app.all('/api/*path', (_req: Request, res: Response) => {
  res
    .status(404)
    .json({ success: false, error: { message: 'API route not found', code: 'ROUTE_NOT_FOUND' } });
});

// Universal 404 for non-API paths. Browsers get the styled HTML 404 page;
// JSON/probe clients get a consistent JSON envelope matching the /api 404.
app.use((req: Request, res: Response) => {
  if (isBrowserRequest(req)) {
    res.status(404).type('html').send(renderNotFoundPage(req.originalUrl));
    return;
  }
  res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
});

// Sentry error handler
Sentry.setupExpressErrorHandler(app);

// Global Error Handling Middleware
import { errorHandler } from './middleware/error';
app.use(errorHandler);

export default app;
