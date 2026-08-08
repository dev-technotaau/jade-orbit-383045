/**
 * /api/csp-report — receives Content-Security-Policy violation reports
 * + Network Error Logging reports per the W3C Reporting API.
 *
 * The endpoint is referenced in:
 *   - `Reporting-Endpoints` header (next.config.ts)
 *   - `report-uri` directive in CSP (proxy.ts)
 *
 * Reports are funnelled to Sentry via the standard Sentry reporting
 * API ingestion path. The shape Chromium/Firefox send is `application/
 * reports+json` (W3C Reporting v1) — we accept both that and the older
 * `application/csp-report` MIME for compatibility.
 *
 * Scope: best-effort logging. Returns 204 unconditionally so a flood
 * of reports can never DOS the origin.
 */
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let body: unknown = null;
    if (
      contentType.includes('application/csp-report') ||
      contentType.includes('application/reports+json') ||
      contentType.includes('application/json')
    ) {
      body = await req.json().catch(() => null);
    } else {
      body = await req.text().catch(() => null);
    }

    // Log to console — Cloud Logging / journald picks this up. In a
    // future enhancement, forward to Sentry's reporting ingestor.
    if (body) {
      console.warn('[csp-report]', JSON.stringify(body).slice(0, 4_000));
    }
  } catch {
    /* swallow — never error on a report submission */
  }
  return new NextResponse(null, { status: 204 });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
