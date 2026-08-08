/**
 * HTML page renderer for frontend-facing backend endpoints.
 *
 * Strategy — content negotiation:
 *   - If the request explicitly accepts text/html (browser navigation),
 *     render a polished self-documenting HTML page.
 *   - Otherwise (k8s probes, curl default Accept any-type, API clients sending
 *     `Accept: application/json`, no-header clients), return the original
 *     JSON response unchanged.
 *
 * This keeps every probe, scraper, and integration working exactly as
 * before — the JSON shape is the authoritative contract — and only
 * layers HTML on top for the browser URL-bar use case.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Request } from 'express';

/**
 * Read the API version from package.json at runtime.
 *
 * We deliberately avoid `import pkg from '../../package.json'`: TypeScript's
 * `rootDir: ./src` would consider that JSON outside the source root, which
 * surfaces as an IDE/strict-build error and would also break if the project
 * ever flips on `isolatedModules`. Reading the file dynamically sidesteps
 * the rootDir check while producing the same runtime behaviour — package.json
 * sits at the project root in both dev (ts-node from src/utils) and prod
 * (compiled JS in dist/utils), so `__dirname/../../package.json` resolves
 * identically in both environments.
 */
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf-8')) as {
  version: string;
};

export const API_VERSION = pkg.version;
export const BRAND = 'Hire Adda API';
export const BRAND_SHORT = 'Hire Adda';
export const BRAND_COLOR = '#1E5CAF';
export const BRAND_ACCENT = '#F5880A';

/**
 * True when the caller is a browser (explicit `text/html` in Accept).
 * False for probes (any-type Accept), curl default, and JSON-accepting clients.
 *
 * We key on literal substring "text/html" rather than `req.accepts()`
 * because Express's content-negotiator interprets the any-type Accept as
 * accepting any listed type — which would misroute probes into HTML.
 */
export function isBrowserRequest(req: Request): boolean {
  const accept = req.headers.accept;
  if (!accept) return false;
  return accept.includes('text/html');
}

type StatusTone = 'ok' | 'warn' | 'error' | 'info' | 'muted';

interface StatusPillOptions {
  tone: StatusTone;
  label: string;
}

function pill({ tone, label }: StatusPillOptions): string {
  return `<span class="pill pill-${tone}">${escape(label)}</span>`;
}

/** Escape a value for safe insertion as HTML text content. */
export function escape(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Header wordmark — same logo the public site renders at hireadda.in.
 * Loaded as an <img> instead of inlined because the production wordmark
 * SVG is ~345 KB; embedding it would balloon every probe response.
 *
 * NOTE: requires `https://hireadda.in` in the backend's helmet CSP imgSrc
 * directive (see backend/src/app.ts) — without it the browser blocks
 * the load and the header renders empty.
 */
const PUBLIC_LOGO_URL = 'https://hireadda.in/icons/logo.svg';

/**
 * Inline "HA" monogram — used only as a data-URL favicon so the tab icon
 * works even when the public site is unreachable. Matches the BIMI mark
 * at frontend/public/icons/logo-bimi.svg.
 */
const FAVICON_MARK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <rect x="0" y="0" width="100" height="100" rx="12" ry="12" fill="#FFFFFF" />
  <path d="M 16 25 L 22 25 L 22 47 L 34 47 L 34 25 L 40 25 L 40 75 L 34 75 L 34 53 L 22 53 L 22 75 L 16 75 Z" fill="${BRAND_ACCENT}" />
  <path d="M 52 75 L 58.5 75 L 61 65 L 77 65 L 79.5 75 L 86 75 L 73 25 L 65 25 Z M 63 59 L 69 35 L 75 59 Z" fill="${BRAND_COLOR}" />
</svg>
`;

/**
 * Shared page chrome — header, container, footer, CSS.
 * All pages pass their title + bodyHtml in; the layout handles the rest.
 */
interface LayoutArgs {
  title: string;
  subtitle?: string;
  status?: { tone: StatusTone; label: string };
  bodyHtml: string;
  /** Optional meta-refresh (in seconds) — used on /health for live updates. */
  refreshSeconds?: number;
}

export function renderLayout(args: LayoutArgs): string {
  const meta = args.refreshSeconds
    ? `<meta http-equiv="refresh" content="${args.refreshSeconds}">`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light dark">
${meta}
<title>${escape(args.title)} · ${escape(BRAND)}</title>
<!-- Favicon: mirrors hireadda.in's public stack so the tab icon matches.
     Inline SVG monogram is listed last as a self-contained fallback for
     when the public site is unreachable — kept tiny (~500 bytes). -->
<link rel="icon" type="image/png" sizes="16x16" href="https://hireadda.in/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="https://hireadda.in/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="https://hireadda.in/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="https://hireadda.in/apple-icon.png">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;utf8,${encodeURIComponent(FAVICON_MARK)}">
<style>
${BASE_CSS}
</style>
</head>
<body>
<header class="site-header">
  <a class="brand" href="/">
    <img class="logo" src="${PUBLIC_LOGO_URL}" alt="${escape(BRAND_SHORT)}" width="205" height="48" />
    <span class="brand-tag">API</span>
  </a>
  <nav class="site-nav" aria-label="API navigation">
    <a href="/health">Health</a>
    <a href="/health/live">Live</a>
    <a href="/health/ready">Ready</a>
    <a href="/metrics">Metrics</a>
    <a href="/api-docs">API Docs</a>
    <a href="https://hireadda.in" class="external">hireadda.in ↗</a>
  </nav>
</header>

<main class="wrap">
  <div class="title-row">
    <div>
      <h1>${escape(args.title)}</h1>
      ${args.subtitle ? `<p class="subtitle">${escape(args.subtitle)}</p>` : ''}
    </div>
    ${args.status ? pill(args.status) : ''}
  </div>
  ${args.bodyHtml}
</main>

<footer class="site-footer">
  <div class="foot-inner">
    <div>
      <strong>${escape(BRAND)}</strong> · v${escape(API_VERSION)} · Node ${escape(process.version)}
    </div>
    <div class="foot-links">
      <a href="/api-docs">OpenAPI</a>
      <span>·</span>
      <a href="/metrics">Prometheus</a>
      <span>·</span>
      <a href="https://hireadda.in/site-map">Site Map</a>
      <span>·</span>
      <a href="https://hireadda.in/.well-known/security.txt">security.txt</a>
    </div>
  </div>
</footer>

</body>
</html>`;
}

/**
 * Base CSS — all pages share one stylesheet. Uses CSS custom properties
 * so both light and dark schemes work from a single declaration.
 */
const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --bg:#F8FAFC;--surface:#FFFFFF;--border:#E2E8F0;--text:#0F172A;
  --text-muted:#64748B;--primary:${BRAND_COLOR};--accent:${BRAND_ACCENT};
  --ok:#16A34A;--ok-bg:#DCFCE7;--warn:#D97706;--warn-bg:#FEF3C7;
  --error:#DC2626;--error-bg:#FEE2E2;--info:#0284C7;--info-bg:#E0F2FE;
  --muted:#64748B;--muted-bg:#F1F5F9;--shadow:0 1px 3px rgba(15,23,42,.05),0 4px 12px rgba(15,23,42,.04);
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0B1220;--surface:#111A2E;--border:#1E293B;--text:#F8FAFC;
    --text-muted:#94A3B8;--primary:#60A5FA;--accent:#FB923C;
    --ok:#22C55E;--ok-bg:#052E1A;--warn:#F59E0B;--warn-bg:#3B2608;
    --error:#F87171;--error-bg:#3B0F11;--info:#38BDF8;--info-bg:#0C2A3D;
    --muted:#94A3B8;--muted-bg:#1A2436;--shadow:0 1px 3px rgba(0,0,0,.4),0 4px 12px rgba(0,0,0,.3);
  }
}
html,body{margin:0;padding:0}
body{
  background:var(--bg);color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased;
  min-height:100vh;display:flex;flex-direction:column;
}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
.site-header{
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:18px 24px;border-bottom:1px solid var(--border);background:var(--surface);
  flex-wrap:wrap;position:sticky;top:0;z-index:10;backdrop-filter:saturate(180%) blur(10px);
}
.brand{display:flex;align-items:center;gap:10px;color:inherit}
.brand:hover{text-decoration:none}
.logo{height:36px;width:auto;flex:none;display:block}
.brand-tag{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;
  color:var(--text-muted);padding:3px 8px;border:1px solid var(--border);border-radius:6px;
  background:var(--muted-bg);line-height:1}
.site-nav{display:flex;gap:18px;flex-wrap:wrap;font-size:14px}
.site-nav a{color:var(--text-muted);font-weight:500}
.site-nav a:hover{color:var(--primary);text-decoration:none}
.site-nav a.external{color:var(--accent)}
.wrap{max-width:1040px;margin:0 auto;padding:40px 24px;flex:1;width:100%}
.title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:32px;flex-wrap:wrap}
h1{font-size:32px;font-weight:700;letter-spacing:-.02em;margin:0 0 6px}
.subtitle{color:var(--text-muted);margin:0;font-size:15px}
h2{font-size:18px;font-weight:600;letter-spacing:-.01em;margin:32px 0 16px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;
  font-size:12px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.pill-ok{color:var(--ok);background:var(--ok-bg)}
.pill-warn{color:var(--warn);background:var(--warn-bg)}
.pill-error{color:var(--error);background:var(--error-bg)}
.pill-info{color:var(--info);background:var(--info-bg)}
.pill-muted{color:var(--muted);background:var(--muted-bg)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:var(--shadow)}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.card-title{font-weight:600;font-size:14px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
.card-value{font-size:24px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.card-sub{font-size:12px;color:var(--text-muted);margin-top:4px;font-family:var(--mono)}
.meter{height:6px;background:var(--muted-bg);border-radius:999px;overflow:hidden;margin-top:10px}
.meter-fill{height:100%;background:linear-gradient(90deg,var(--primary),var(--accent));border-radius:999px;transition:width .4s ease}
.kv{display:grid;grid-template-columns:minmax(140px,max-content) 1fr;gap:8px 20px;font-size:14px}
.kv dt{color:var(--text-muted);font-weight:500}
.kv dd{margin:0;font-family:var(--mono);word-break:break-all}
.link-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.link-card{display:flex;flex-direction:column;gap:4px;padding:14px 16px;background:var(--surface);
  border:1px solid var(--border);border-radius:10px;transition:border-color .15s,transform .15s}
.link-card:hover{text-decoration:none;border-color:var(--primary);transform:translateY(-1px)}
.link-card-label{font-weight:600;color:var(--text)}
.link-card-desc{font-size:12px;color:var(--text-muted)}
.link-card-path{font-family:var(--mono);font-size:11px;color:var(--primary);margin-top:2px}
.site-footer{border-top:1px solid var(--border);padding:24px;margin-top:auto;background:var(--surface);font-size:13px;color:var(--text-muted)}
.foot-inner{max-width:1040px;margin:0 auto;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}
.foot-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.foot-links a{color:var(--text-muted)}
.error-hero{text-align:center;padding:40px 0}
.error-code{font-size:96px;font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--primary);font-variant-numeric:tabular-nums}
.error-msg{font-size:20px;color:var(--text-muted);margin:12px 0 24px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:8px;
  background:var(--primary);color:#fff;font-weight:600;font-size:14px;transition:opacity .15s}
.btn:hover{text-decoration:none;opacity:.9;color:#fff}
code{font-family:var(--mono);font-size:13px;background:var(--muted-bg);padding:2px 6px;border-radius:4px}
@media (max-width:640px){
  .site-header{padding:14px 16px;flex-direction:column;align-items:flex-start}
  .site-nav{gap:12px}
  h1{font-size:24px}
  .wrap{padding:24px 16px}
}
`;

// ─── Page builders ────────────────────────────────────────────────────────

/** GET / — root landing page. */
export function renderRootPage(): string {
  const body = `
<p class="subtitle" style="margin-bottom:24px">
  This is the ${escape(BRAND_SHORT)} backend service. Public product lives at
  <a href="https://hireadda.in">hireadda.in</a>. Start with the OpenAPI docs or
  check live health below.
</p>

<h2>Quick Links</h2>
<div class="link-grid">
  <a class="link-card" href="/api-docs">
    <span class="link-card-label">OpenAPI / Swagger</span>
    <span class="link-card-desc">Interactive API explorer with auth + live requests</span>
    <span class="link-card-path">/api-docs</span>
  </a>
  <a class="link-card" href="/health">
    <span class="link-card-label">Health Status</span>
    <span class="link-card-desc">Database, Redis, Elasticsearch, system metrics</span>
    <span class="link-card-path">/health</span>
  </a>
  <a class="link-card" href="/health/live">
    <span class="link-card-label">Liveness Probe</span>
    <span class="link-card-desc">Fast check — is the process running?</span>
    <span class="link-card-path">/health/live</span>
  </a>
  <a class="link-card" href="/health/ready">
    <span class="link-card-label">Readiness Probe</span>
    <span class="link-card-desc">Ready to serve traffic? DB + Redis + Kafka lag</span>
    <span class="link-card-path">/health/ready</span>
  </a>
  <a class="link-card" href="/metrics">
    <span class="link-card-label">Prometheus Metrics</span>
    <span class="link-card-desc">HTTP, GC, event-loop, queue + custom gauges</span>
    <span class="link-card-path">/metrics</span>
  </a>
  <a class="link-card" href="/api/csrf-token">
    <span class="link-card-label">CSRF Token</span>
    <span class="link-card-desc">Required header for mutating requests</span>
    <span class="link-card-path">/api/csrf-token</span>
  </a>
</div>

<h2>Base URL</h2>
<div class="card">
  <dl class="kv">
    <dt>Current API</dt><dd><code>/api/v1</code> (stable)</dd>
    <dt>Example</dt><dd><code>GET /api/v1/jobs?limit=10</code></dd>
    <dt>Auth</dt><dd>Bearer token (JWT) or httpOnly <code>ha_access_token</code> cookie</dd>
    <dt>CSRF</dt><dd><code>x-csrf-token</code> header on POST/PUT/PATCH/DELETE</dd>
    <dt>Rate limits</dt><dd>Returned on every response via <code>X-RateLimit-*</code> headers</dd>
  </dl>
</div>

<h2>Status</h2>
<div class="card">
  <p style="margin:0;color:var(--text-muted)">
    For live health and dependency status, see
    <a href="/health">/health</a>. For continuous monitoring, point your
    observability stack at <a href="/metrics">/metrics</a>.
  </p>
</div>
`;
  return renderLayout({
    title: 'Welcome',
    subtitle: `v${API_VERSION} · REST API & realtime backend for Hire Adda`,
    status: { tone: 'ok', label: 'Online' },
    bodyHtml: body,
  });
}

/** GET /health — full health with DB/Redis/ES + system metrics. */
interface HealthData {
  status: 'healthy' | 'degraded';
  checks: Record<string, string>;
  system: {
    uptime: number;
    startedAt: string;
    memoryUsage: { rss: string; heapUsed: string; heapTotal: string };
    nodeVersion: string;
    pid: number;
  };
  timestamp: string;
}

function statusToTone(s: string): StatusTone {
  return s === 'up' ? 'ok' : s === 'down' ? 'error' : 'warn';
}

function parseMb(s: string): number {
  const m = /([\d.]+)/.exec(s);
  return m ? parseFloat(m[1]) : 0;
}

export function renderHealthPage(data: HealthData): string {
  const overallTone: StatusTone = data.status === 'healthy' ? 'ok' : 'warn';
  const heapUsedMb = parseMb(data.system.memoryUsage.heapUsed);
  const heapTotalMb = parseMb(data.system.memoryUsage.heapTotal);
  const heapPct = heapTotalMb > 0 ? Math.min(100, (heapUsedMb / heapTotalMb) * 100) : 0;

  const checkCards = Object.entries(data.checks)
    .map(
      ([name, status]) => `
<div class="card">
  <div class="card-head">
    <div class="card-title">${escape(name)}</div>
    ${pill({ tone: statusToTone(status), label: status })}
  </div>
  <div class="card-value">${status === 'up' ? '✓' : '✕'}</div>
  <div class="card-sub">${escape(name)}.connection</div>
</div>`
    )
    .join('');

  const body = `
<h2>Dependencies</h2>
<div class="grid">${checkCards}</div>

<h2>System</h2>
<div class="grid">
  <div class="card">
    <div class="card-title">Uptime</div>
    <div class="card-value">${formatUptime(data.system.uptime)}</div>
    <div class="card-sub">started ${escape(data.system.startedAt)}</div>
  </div>
  <div class="card">
    <div class="card-title">Memory (heap)</div>
    <div class="card-value">${escape(data.system.memoryUsage.heapUsed)}</div>
    <div class="card-sub">of ${escape(data.system.memoryUsage.heapTotal)} allocated · RSS ${escape(data.system.memoryUsage.rss)}</div>
    <div class="meter"><div class="meter-fill" style="width:${heapPct.toFixed(1)}%"></div></div>
  </div>
  <div class="card">
    <div class="card-title">Node.js</div>
    <div class="card-value" style="font-family:var(--mono);font-size:18px">${escape(data.system.nodeVersion)}</div>
    <div class="card-sub">pid ${data.system.pid}</div>
  </div>
  <div class="card">
    <div class="card-title">Checked at</div>
    <div class="card-value" style="font-size:14px;font-family:var(--mono)">${escape(data.timestamp)}</div>
    <div class="card-sub">auto-refresh every 10 seconds</div>
  </div>
</div>

<h2>Raw JSON</h2>
<p style="color:var(--text-muted);font-size:13px;margin-top:-8px;margin-bottom:12px">
  Same payload a probe would receive — curl this endpoint or add
  <code>Accept: application/json</code> to get the JSON directly.
</p>
<div class="card">
  <pre style="margin:0;overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.5">${escape(JSON.stringify(data, null, 2))}</pre>
</div>
`;
  return renderLayout({
    title: 'Health Status',
    subtitle: `Full dependency check · HTTP ${data.status === 'healthy' ? 200 : 503}`,
    status: { tone: overallTone, label: data.status },
    bodyHtml: body,
    refreshSeconds: 10,
  });
}

/** GET /health/live — minimal liveness. */
export function renderLivenessPage(data: { status: string; timestamp: string }): string {
  const body = `
<div class="card">
  <p style="margin:0 0 12px;color:var(--text-muted)">
    Liveness confirms the Node.js process is running and responding to HTTP. It
    does <em>not</em> check downstream dependencies — use
    <a href="/health/ready">/health/ready</a> for readiness or
    <a href="/health">/health</a> for the full picture.
  </p>
  <dl class="kv">
    <dt>Status</dt><dd><code>${escape(data.status)}</code></dd>
    <dt>Timestamp</dt><dd><code>${escape(data.timestamp)}</code></dd>
    <dt>Probe path</dt><dd><code>/health/live</code></dd>
    <dt>Purpose</dt><dd>Kubernetes livenessProbe — restarts the pod if this fails</dd>
  </dl>
</div>
`;
  return renderLayout({
    title: 'Liveness',
    subtitle: 'Kubernetes livenessProbe endpoint',
    status: { tone: 'ok', label: data.status },
    bodyHtml: body,
    refreshSeconds: 15,
  });
}

/** GET /health/ready — readiness + Kafka lag. */
interface ReadinessData {
  status: 'ready' | 'not_ready';
  checks: {
    database: string;
    redis: string;
    kafka: {
      connected: boolean;
      lag: Record<string, number> | null;
      totalLag: number;
      healthy: boolean;
    };
  };
  timestamp: string;
}

export function renderReadinessPage(data: ReadinessData): string {
  const overallTone: StatusTone = data.status === 'ready' ? 'ok' : 'warn';
  const kafka = data.checks.kafka;
  const kafkaTone: StatusTone = !kafka.connected ? 'muted' : kafka.healthy ? 'ok' : 'warn';
  const kafkaLabel = !kafka.connected ? 'disconnected' : kafka.healthy ? 'healthy' : 'lagging';

  const lagRows = kafka.lag
    ? Object.entries(kafka.lag)
        .map(
          ([topic, count]) => `
<div class="card">
  <div class="card-title">${escape(topic)}</div>
  <div class="card-value">${count.toLocaleString()}</div>
  <div class="card-sub">consumer lag (messages)</div>
</div>`
        )
        .join('')
    : '<div class="card"><p style="margin:0;color:var(--text-muted)">No Kafka lag data available.</p></div>';

  const body = `
<h2>Core Dependencies</h2>
<div class="grid">
  <div class="card">
    <div class="card-head"><div class="card-title">Database</div>${pill({ tone: statusToTone(data.checks.database), label: data.checks.database })}</div>
    <div class="card-value">${data.checks.database === 'up' ? '✓' : '✕'}</div>
    <div class="card-sub">PostgreSQL · SELECT 1</div>
  </div>
  <div class="card">
    <div class="card-head"><div class="card-title">Redis</div>${pill({ tone: statusToTone(data.checks.redis), label: data.checks.redis })}</div>
    <div class="card-value">${data.checks.redis === 'up' ? '✓' : '✕'}</div>
    <div class="card-sub">cache + BullMQ</div>
  </div>
  <div class="card">
    <div class="card-head"><div class="card-title">Kafka</div>${pill({ tone: kafkaTone, label: kafkaLabel })}</div>
    <div class="card-value">${kafka.totalLag >= 0 ? kafka.totalLag.toLocaleString() : '—'}</div>
    <div class="card-sub">total consumer lag across topics</div>
  </div>
</div>

<h2>Per-Topic Kafka Lag</h2>
<div class="grid">${lagRows}</div>

<h2>Raw JSON</h2>
<div class="card">
  <pre style="margin:0;overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.5">${escape(JSON.stringify(data, null, 2))}</pre>
</div>
`;
  return renderLayout({
    title: 'Readiness',
    subtitle: `Kubernetes readinessProbe · HTTP ${data.status === 'ready' ? 200 : 503}`,
    status: { tone: overallTone, label: data.status },
    bodyHtml: body,
    refreshSeconds: 15,
  });
}

/** Generic 404 — non-API paths. */
export function renderNotFoundPage(path: string): string {
  const body = `
<div class="error-hero">
  <div class="error-code">404</div>
  <p class="error-msg">No route matches <code>${escape(path)}</code> on this service.</p>
  <a class="btn" href="/">← Back to API home</a>
</div>

<h2>Looking for something specific?</h2>
<div class="link-grid">
  <a class="link-card" href="/api-docs">
    <span class="link-card-label">Browse the API</span>
    <span class="link-card-desc">Interactive OpenAPI spec with every endpoint</span>
    <span class="link-card-path">/api-docs</span>
  </a>
  <a class="link-card" href="/health">
    <span class="link-card-label">Check service health</span>
    <span class="link-card-desc">Dependency status + system metrics</span>
    <span class="link-card-path">/health</span>
  </a>
  <a class="link-card" href="https://hireadda.in">
    <span class="link-card-label">Public website</span>
    <span class="link-card-desc">This is the backend — humans probably want the app</span>
    <span class="link-card-path">hireadda.in</span>
  </a>
</div>
`;
  return renderLayout({
    title: 'Not Found',
    subtitle: 'The endpoint you requested does not exist.',
    status: { tone: 'error', label: '404' },
    bodyHtml: body,
  });
}
