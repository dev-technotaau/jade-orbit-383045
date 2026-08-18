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
import { env } from './config/env';
import healthRoutes from './routes/health.routes';
import metricsRoutes, {
  httpRequestDuration,
  httpRequestsTotal,
  activeConnections,
} from './routes/metrics.routes';
import requestId from './middleware/request-id';
import { requireAppPassword, requireMetricsToken } from './middleware/app-password';
import {
  isBrowserRequest,
  renderRootPage,
  renderNotFoundPage,
  FAVICON_MARK,
} from './utils/pretty-page';
// Audit middleware applied per-route in admin.routes.ts

const app: Application = express();

// API v1 Router (for versioning)
const apiV1Router = Router();

/**
 * Trust proxy depth — how many reverse proxies sit in front of Express.
 *
 * This decides what `req.ip` resolves to. It is deployment-specific and cannot
 * be hardcoded, and no single value fits every path into this process: the
 * console arrives browser → Next.js BFF (a server-side fetch that copies the
 * client's X-Forwarded-For) → load balancer, which is one hop more than Meta's
 * webhook, which reaches the same load balancer directly. Set it for the SHORTER
 * chain — 1 for a single load balancer. Going higher to chase the BFF's extra
 * hop would make the webhook trust an X-Forwarded-For that anyone can forge.
 *
 * Operator abuse controls therefore no longer depend on getting this right:
 * the BFF sends a per-browser `x-operator-key` and `apiLimiter` /
 * `ddosProtection` key on that (middleware/ddos-protection.ts), so the whole
 * team no longer shares the BFF's egress IP as one bucket. IP keying is what
 * is left for the webhook and for /unlock, where there is no session yet.
 *
 * Confirm it per deployment: `GET /api/v1/unlock/whoami` echoes `ip`/`ips` (see
 * routes/unlock.routes.ts) — `ip` should be the operator's real address.
 */
app.set('trust proxy', parseInt(env.TRUST_PROXY_HOPS, 10));


import { xssSanitize } from './middleware/xss-sanitize';
import { enforceContentType } from './middleware/content-type';
import { ddosProtection } from './middleware/ddos-protection';
import { waf } from './middleware/waf';

// Security middleware
app.use(requestId()); // Add request ID for tracing

// ----------------------------------------------------------
// Prometheus HTTP metrics — mounted at the very top, and it has to stay above
// the public Meta routes further down (webhook, Flows data-exchange,
// short-link redirect, Chatwoot bridge). Those handlers end the request, so a
// middleware registered after them never runs: every inbound message and
// delivery status from Meta — the busiest traffic this service takes — was
// absent from http_requests_total and the latency histogram. That is the one
// endpoint whose latency decides whether Meta retries and eventually disables
// the subscription, and it was the one endpoint the HTTP dashboards could not
// see.
//
// Above ddosProtection/waf as well, so a blocked flood still registers. Their
// requests match no route, so they all collapse onto route="unmatched" and add
// no label cardinality.
//
// /health and /metrics are skipped. Both were mounted above this middleware
// before the move and so were never measured; folding in two kubelet probes
// every 10s and the scrape itself would pull p50 toward their sub-millisecond
// timings and mask the regressions this exists to catch. Their router-relative
// `req.route.path` is '/' too, which would merge them into the root route's
// series.
// ----------------------------------------------------------
// Case-insensitive for the same reason the route label is lower-cased below:
// Express matches /Health to the health router too, so a case-sensitive test
// here would have folded those probes into the measured histogram after all.
const UNMEASURED_PATH = /^\/(?:health|metrics)(?:\/|$)/i;
app.use((req: Request, res: Response, next) => {
  if (UNMEASURED_PATH.test(req.path)) {
    next();
    return;
  }
  activeConnections.inc();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // `req.route` is undefined for anything that matched no route, and using
    // the raw path there let a remote caller mint a new Prometheus label set
    // per request — each one ~12 retained series, held for the life of the
    // process. A loop over /a, /aa, /aaa… is a heap-exhaustion DoS. Unmatched
    // requests are all the same thing for metrics purposes.
    //
    // `req.route.path` is relative to the router the handler lives in, so on its
    // own it collapsed every mounted `/:id` into one series: conversation,
    // contact, campaign and audit lookups all landed on route="/:id" and no
    // per-endpoint latency could be read out of the histogram at all. Prefixing
    // it with the mount path makes them distinct, and a router's index route
    // reports '/', so that one contributes only the mount path rather than a
    // trailing slash every dashboard query would have to allow for.
    //
    // The mount path is LOWER-CASED, because `req.baseUrl` is not the mount
    // pattern: it is the matched slice of the ACTUAL request URL, and Express
    // routing is case-insensitive unless `case sensitive routing` is set, which
    // nothing here does. Checked against this app's express: GET
    // /API/v1/WhatsApp/CONVERSATIONS/x reaches the same handler and reports
    // baseUrl='/API/v1/WhatsApp'. Every mount in this file is lower-case, so
    // lower-casing folds all 2^n casings of a path back onto its one canonical
    // series; without it any caller could mint thousands of label sets off
    // /api/v1/unlock alone — mounted above the auth layers and publicly
    // reachable — at ~12 retained series each, which is precisely the
    // heap-exhaustion DoS the 'unmatched' sentinel exists to cap. Encoded or
    // doubled separators (/api/v1/%77hatsapp, /api/v1//whatsapp) match no route
    // at all and already collapse onto that sentinel.
    const routePath = req.route?.path;
    const mount = req.baseUrl.toLowerCase();
    const route = routePath
      ? routePath === '/'
        ? mount || '/'
        : `${mount}${routePath}`
      : 'unmatched';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    end(labels);
    httpRequestsTotal.inc(labels);
    activeConnections.dec();
  });
  next();
});

app.use(ddosProtection()); // DDoS protection (Redis-backed per-IP rate tracking)
app.use(waf()); // WAF rules (SQL injection, path traversal, exploit probes)

// ----------------------------------------------------------
// Structured request logging with correlation ID and duration — up here for
// the same reason as the metrics middleware above. It used to sit below the
// body parsers, which put it below the Meta webhook, the Flows endpoint, the
// short-link redirect and the bridge proxy, so none of that traffic left a log
// line: a message Meta swears it delivered could not be traced to a request at
// all. It reads only method, URL, status and req.id, so it has no body-parser
// dependency at this position.
//
// Deliberately BELOW ddosProtection/waf, unlike the metrics middleware: both
// already emit their own warn line per blocked request, and a second one would
// double log volume during exactly the flood that makes log volume a problem.
// ----------------------------------------------------------
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

// Helmet with strict Content Security Policy (CSP) & HSTS
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'"],
        frameSrc: ["'self'"],
        frameAncestors: ["'none'"], // Modern CSP3 replacement for X-Frame-Options: DENY
        // No remote image host at all. Was hardcoded to assets.hireadda.in, then
        // to whatever R2_PUBLIC_URL named — which on this deployment was the
        // bucket's anonymous `*.r2.dev` domain, i.e. the archived customer media
        // this app otherwise serves only through an authenticated proxy. The
        // pretty-pages' remote wordmark that also needed a host here is now an
        // inline data-URL, so nothing is left that loads an image off-origin.
        imgSrc: ["'self'", 'data:'],
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
import {
  whatsappWebhookRawBody,
  whatsappWebhookErrorHandler,
} from './middleware/whatsapp-webhook-rawbody';
import { webhookLimiter } from './middleware/rate-limit';
import {
  verifyWhatsappWebhook,
  handleWhatsappWebhook,
} from './controllers/whatsapp-webhook.controller';
import {
  decryptFlowRequest,
  encryptFlowResponse,
  handleFlowRequest,
} from './services/whatsapp-flow-data.service';
// The GET verification handshake is called a handful of times in the lifetime of
// a deployment (Meta calls it when you subscribe), so it gets the same ceiling
// as the POST. It used to have none at all: mounted before apiLimiter, skipped
// by webhookLimiter, and exempted from ddosProtection by a path match that did
// not distinguish the method — an unauthenticated, unmetered endpoint that logs
// a warn line per request.
app.get('/api/v1/webhooks/whatsapp', webhookLimiter, verifyWhatsappWebhook);
// ----------------------------------------------------------
// WhatsApp Flows data-exchange endpoint.
//
// Called by Meta (not by a browser) for ENDPOINT-BACKED flows, so it sits with
// the other public, limiter-exempt Meta routes and carries no app-password gate.
// Its authentication IS the encryption: the body is RSA-OAEP + AES-128-GCM and
// only the holder of the private key can read or answer it.
//
// Responses are base64 ciphertext with a text/plain content type - Meta rejects
// a JSON-wrapped reply.
// ----------------------------------------------------------
app.post('/api/v1/webhooks/flows-data', webhookLimiter, async (req: Request, res: Response) => {
  try {
    const { request, aesKey, iv } = decryptFlowRequest(req.body);
    const response = await handleFlowRequest(request);
    res
      .status(200)
      .type('text/plain')
      .send(encryptFlowResponse(response, aesKey, iv));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('WhatsApp Flow data-exchange failed', { err: message });
    // 421 is what Meta documents for "cannot decrypt" - it tells the client to
    // refresh the public key rather than showing the customer a dead end.
    res.status(421).json({ error: message });
  }
});

app.post(
  '/api/v1/webhooks/whatsapp',
  webhookLimiter,
  whatsappWebhookRawBody(),
  handleWhatsappWebhook
);
// Route-scoped error handler, mounted immediately after the webhook routes so
// it — and not the global one at the bottom of this file — answers anything
// they throw. The global handler returns `err.statusCode`, which for the raw
// parser's `entity.too.large` is a 413: a retryable failure Meta would redeliver
// into forever, counting towards disabling the subscription. Here the whole
// route keeps the controller's always-2xx contract, not just its body.
app.use('/api/v1/webhooks/whatsapp', whatsappWebhookErrorHandler);

// ----------------------------------------------------------
// Public WhatsApp short-link click redirect — mounted BEFORE the API rate
// limiter (it lives outside `/api`, but kept here next to the other public,
// limiter-exempt routes). Records the click (best-effort) then 302s to the
// target URL; unknown / failed codes return a plain 404. No auth — these are
// the public links embedded in outbound campaign messages.
//
// `?r=` is the signed per-recipient token the campaign worker appends when it
// substitutes a short link into a template parameter. Without it a click was an
// anonymous counter increment: no click→conversion funnel, no retargeting of
// clickers, and no per-variant CTR on an A/B test. It is validated against the
// link id inside recordClick, so a tampered value degrades to an anonymous
// click rather than attributing it to somebody else's contact record.
// ----------------------------------------------------------
import { recordClick } from './services/whatsapp-shortlink.service';
app.get('/l/:code', async (req: Request, res: Response) => {
  try {
    const r = req.query.r;
    const url = await recordClick(String(req.params.code), {
      recipientToken: typeof r === 'string' ? r : undefined,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    // The scheme is re-checked here rather than trusted from storage: rows
    // written before the create schema pinned http(s) — or by any future writer —
    // must not be able to turn this public endpoint into a `javascript:` / `data:`
    // Location. A stored value that does not parse throws into the catch below,
    // which 404s, and that is the right answer for a link we cannot honour.
    if (url && /^https?:$/.test(new URL(url).protocol)) {
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

// Conversion postbacks from a client's website / CRM — own JSON parser, gated by
// X-Conversion-Key (see middleware/app-password.ts), mounted here for the same
// reason as the bridge proxy above: an external system holds neither the app
// password nor a CSRF token, and both gates sit further down. Deduped on
// `externalId` so a retry cannot double-count.
import { conversionIngestRouter } from './routes/whatsapp.routes';
app.use('/api/v1/whatsapp/ingest', express.json({ limit: '64kb' }), conversionIngestRouter);

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
/**
 * Campaigns get a parser of their own, wider than the 2 MB bulk one.
 *
 * The campaign body carries the whole uploaded audience, and that audience can be
 * PERSONALISED — `recipients: [{ phone, name, vars }]` — so a row is no longer a
 * ~16-byte phone entry but ~100 bytes with a name and two columns, and several
 * hundred for a fuller CSV row. On the 10 KB default an upload audience silently
 * capped at roughly 500 numbers; on 2 MB the advertised 20,000-row personalised
 * list is already ~2 MB before the rest of the body and hit the very same nameless
 * 413 the raise was meant to remove. Held ABOVE WA_UPLOAD_PAYLOAD_MAX_BYTES (schemas/whatsapp.schema.ts)
 * so a list past that budget is answered by the schema's quotable message instead
 * of by the parser, and mounted on the whole `/campaigns` subtree so sizing an
 * audience (POST /campaigns/preview-audience) cannot fail where creating it works.
 */
app.use('/api/v1/whatsapp/campaigns', express.json({ limit: '8mb' }));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser()); // Cookie parser must be before CSRF

// Content-Type enforcement (must run AFTER body parsing)
app.use(enforceContentType());

// XSS sanitization (must run AFTER body parsing so req.body exists)
app.use(xssSanitize());

// Compression
app.use(
  compression({
    // Never re-encode a response that advertises byte ranges. Content-Range
    // names offsets in the STORED object; gzipping the slice makes those
    // offsets describe bytes the browser never receives, so a seeking video
    // player decodes garbage. This is not hypothetical for the WhatsApp media
    // proxy: its fallback content type, application/octet-stream, is marked
    // compressible in mime-db, so every attachment served without a precise
    // mime was being gzipped on the way out.
    filter: (req, res) => {
      if (res.getHeader('Content-Range') || res.getHeader('Accept-Ranges') === 'bytes') {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// Request timeout (30s for normal requests)
import { requestTimeout } from './middleware/timeout';

/**
 * Routes whose duration is set by a file, not by us: sending an attachment
 * (multipart in, then a full multipart upload to Meta), staging a template
 * header sample, and streaming an attachment back out.
 *
 * They shared the flat 30s budget, which is where the media double-send came
 * from: the 408 fired while the Graph upload was still in flight, the operator
 * saw a failure and retried, and the first attempt went on to deliver. They get
 * a much longer deadline instead of none, so a genuinely stuck request is still
 * reaped.
 */
const MEDIA_PATH =
  /^\/api\/v1\/whatsapp\/(?:conversations\/[^/]+\/media|templates\/media-handle|media)(?:\/|$)/;
const MEDIA_TIMEOUT_MS = 5 * 60 * 1000;
app.use(requestTimeout((req) => (MEDIA_PATH.test(req.path) ? MEDIA_TIMEOUT_MS : 30000)));

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

// MFA management. Mounted HERE, below the CSRF middleware, and not as a child of
// the unlock router — that one sits above CSRF so a locked browser can reach it,
// and a state-changing endpoint must not inherit that exemption.
import { mfaManagementRouter } from './routes/unlock.routes';
apiV1Router.use('/mfa', mfaManagementRouter);

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
// Bearer METRICS_TOKEN, falling back to the operator gate for a browser. Enabling
// MFA used to take the Prometheus scrape offline entirely (requireAppPassword
// refuses the header once 2FA is on), and the documented workaround re-opened
// single-factor access to every operator route.
app.use('/metrics', requireMetricsToken, metricsRoutes);

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

// Browsers request /favicon.ico for any page that does not declare an icon —
// including every JSON endpoint someone opens in a tab. With no route it fell
// through to the universal 404, and the request logger warns on any status
// >= 400, so a routine browser probe wrote a warn line on every visit. That is
// the same log-flooding pattern the webhook GET had. Serving the mark costs
// ~400 bytes and keeps warn-level output meaningful.
app.get('/favicon.ico', (_req: Request, res: Response) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(FAVICON_MARK);
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
