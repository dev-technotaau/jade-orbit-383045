import type { Application, Request, Response } from 'express';
import express, { Router } from 'express';
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

/**
 * Trust proxy depth — how many reverse proxies sit in front of Express.
 *
 * This decides what `req.ip` resolves to, and therefore what the per-IP rate
 * limiter actually keys on. It is deployment-specific and cannot be hardcoded:
 * the browser reaches this API through the Next.js BFF (which re-issues a
 * server-side fetch and copies the client's X-Forwarded-For), and then through
 * whatever load balancer fronts this process. Guess low and every operator
 * shares the BFF's egress IP as one rate-limit bucket; guess high and a client
 * can spoof its own IP by sending an X-Forwarded-For header.
 *
 * Confirm it per deployment: `GET /api/v1/whoami` echoes `ip`/`ips` (see
 * routes/unlock.routes.ts) — `ip` should be the operator's real address.
 */
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

import { env } from './config/env';

import { xssSanitize } from './middleware/xss-sanitize';
import { enforceContentType } from './middleware/content-type';
import { ddosProtection } from './middleware/ddos-protection';
import { waf } from './middleware/waf';

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
        scriptSrc: ["'self'", "'unsafe-eval'"],
        frameSrc: ["'self'"],
        frameAncestors: ["'none'"], // Modern CSP3 replacement for X-Frame-Options: DENY
        imgSrc: [
          "'self'",
          'data:',
          // R2 public bucket, when a custom domain is configured. Was hardcoded
          // to assets.hireadda.in; the pretty-pages' remote wordmark that also
          // needed hireadda.in here is now an inline data-URL, so it is gone.
          ...(env.R2_PUBLIC_URL ? [env.R2_PUBLIC_URL] : []),
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
import { webhookLimiter } from './middleware/rate-limit';
import {
  verifyWhatsappWebhook,
  handleWhatsappWebhook,
} from './controllers/whatsapp-webhook.controller';
app.get('/api/v1/webhooks/whatsapp', verifyWhatsappWebhook);
app.post(
  '/api/v1/webhooks/whatsapp',
  webhookLimiter,
  whatsappWebhookRawBody(),
  handleWhatsappWebhook
);

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

// Apply rate limits
app.use('/api', apiLimiter);

// WhatsApp outbound proxy (optional Chatwoot bridge) — own JSON parser, gated by
// the X-Bridge-Secret header. Lets a self-hosted Chatwoot send through us.
import { handleOutboundProxy } from './controllers/whatsapp-bridge.controller';
app.post(
  '/api/v1/whatsapp-proxy/:phoneNumberId/messages',
  express.json({ limit: '256kb' }),
  handleOutboundProxy
);

/**
 * Bulk endpoints need their own parser, mounted BEFORE the global one.
 *
 * The global limit below is 10 KB, which protects every ordinary route — but
 * `/contacts/import` validates up to 5000 contacts in a single body and
 * `/contacts/bulk` and `/conversations/bulk` take unbounded id arrays. A
 * minimal contact entry is ~26 bytes, so 10 KB held a few hundred at best and
 * closer to a hundred once names and tags were present: the API advertised 5000
 * and rejected the request with a 413 that looks nothing like a size problem.
 *
 * body-parser marks `req._body` once it has parsed, so the global parser below
 * is a no-op for these paths. Raising the global limit instead would remove the
 * protection from every other route.
 */
const bulkJsonParser = express.json({ limit: '2mb' });
app.use('/api/v1/whatsapp/contacts/import', bulkJsonParser);
app.use('/api/v1/whatsapp/contacts/bulk', bulkJsonParser);
app.use('/api/v1/whatsapp/conversations/bulk', bulkJsonParser);
app.use('/api/v1/whatsapp/suppressions', bulkJsonParser);

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
  customSiteTitle: 'WhatsApp Module API Docs',
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

// The host platform served /api/config/otp and /api/config/security here so the
// signup + login forms could mirror backend OTP and password policy. There are
// no such forms — one app password, no accounts — and nothing called either
// endpoint. Removed along with the 18 getters in config/env.ts that fed them.

// ----------------------------------------------------------
// Unlock — MOUNTED BEFORE doubleCsrfProtection, and it must stay there.
//
// This is the only unauthenticated route: it exchanges the app password for the
// HMAC token. It cannot carry a CSRF token, because a CSRF token is fetched
// with credentials the caller does not have yet — that is the whole point of
// unlocking. Mounting it after the CSRF gate made every unlock attempt fail
// with 403 EBADCSRFTOKEN, which made the entire console unreachable.
//
// It is not left unprotected: the handler compares the password in constant
// time and sits behind `authLimiter` (see routes/unlock.routes.ts). CSRF
// protects authenticated state-changing calls; there is no session to ride here.
// ----------------------------------------------------------
import unlockRoutes from './routes/unlock.routes';
apiV1Router.use('/unlock', unlockRoutes);

// Protect all state-changing API routes
// Note: This applies to POST, PUT, DELETE, PATCH requests
apiV1Router.use(doubleCsrfProtection);

// Health check route
app.use('/health', healthRoutes);

/**
 * Prometheus metrics.
 *
 * This used to be unauthenticated, justified by "restricted by NetworkPolicy in
 * K3s" — infrastructure this module no longer ships. On a managed platform the
 * service has a public URL, so that comment described a protection that did not
 * exist, on an endpoint that enumerates queue depths, send volumes and error
 * codes. Gated with the same app password the API docs use; a scraper presents
 * it as `X-App-Password`.
 */
app.use('/metrics', requireAppPassword, metricsRoutes);

// Prometheus HTTP metrics middleware
app.use((req: Request, res: Response, next) => {
  activeConnections.inc();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // `req.route` is undefined for anything that matched no route, and using
    // the raw path there let a remote caller mint a new Prometheus label set
    // per request — each one ~12 retained series, held for the life of the
    // process. A loop over /a, /aa, /aaa… is a heap-exhaustion DoS. Unmatched
    // requests are all the same thing for metrics purposes.
    const route = req.route?.path ?? 'unmatched';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    end(labels);
    httpRequestsTotal.inc(labels);
    activeConnections.dec();
  });
  next();
});

// Maintenance mode check (after health routes so probes still work)

// Passport initialization

// API v1 routes (versioning)
// Mount all versioned API routes under /api/v1
// alertmanagerRoutes is mounted earlier (before CSRF middleware) — see above.

// Mounted BEFORE `/super-admin` so its `/admin-control/*` paths are claimed
// by the dedicated (triple-locked) router rather than falling through to the
// general super-admin router.
import whatsappRoutes from './routes/whatsapp.routes';
// `/unlock` is mounted further up, deliberately ahead of the CSRF gate.
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
    message: 'WhatsApp Module API',
    docs: '/api-docs',
  });
});

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

// Global Error Handling Middleware
import { errorHandler } from './middleware/error';
app.use(errorHandler);

export default app;
