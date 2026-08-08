import type { Request, Response } from 'express';
import { verifyToken } from '../utils/email-token';
import { recordOpen, recordClick, recordUnsubscribe } from '../services/email-tracking.service';
import {
  confirmSubscription,
  resubscribe,
  getSubscriptionState,
} from '../services/email-optin.service';

/**
 * Public, unauthenticated email tracking endpoints (mounted under the WAF/CSRF-
 * exempt `/api/v1/webhooks/email` prefix). They must always respond fast and
 * never leak state — analytics writes are fire-and-forget.
 */

// 1×1 transparent GIF.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const clientMeta = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

function sendPixel(res: Response): void {
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.status(200).end(PIXEL);
}

/** Open pixel: GET /o/:token — token is the recipient's opaque tracking key. */
export const open = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token || '');
  void recordOpen(token, clientMeta(req)).catch(() => {});
  sendPixel(res);
};

/** Click redirect: GET /c/:token — signed { r, c, u }; 302 to the target URL. */
export const click = async (req: Request, res: Response): Promise<void> => {
  const payload = verifyToken<{ r: string; c?: string | null; u: string }>(
    String(req.params.token || '')
  );
  if (!payload || !payload.u) {
    res.status(404).send('Link not found');
    return;
  }
  try {
    const target = await recordClick(payload, clientMeta(req));
    if (target) {
      res.redirect(302, target);
    } else {
      res.status(404).send('Link not found');
    }
  } catch {
    // Even on a logging failure, still send the user to their destination.
    if (/^https?:\/\//i.test(payload.u)) res.redirect(302, payload.u);
    else res.status(404).send('Link not found');
  }
};

/** RFC 8058 one-click unsubscribe: POST /u/:token — must succeed with no interaction. */
export const unsubscribeOneClick = async (req: Request, res: Response): Promise<void> => {
  const payload = verifyToken<{ e: string; r?: string | null; c?: string | null }>(
    String(req.params.token || '')
  );
  if (!payload || !payload.e) {
    res.status(400).send('Invalid unsubscribe link');
    return;
  }
  void recordUnsubscribe(payload, 'one_click', clientMeta(req)).catch(() => {});
  res.status(200).send('You have been unsubscribed.');
};

/** Human unsubscribe landing: GET /u/:token — confirms + records the opt-out. */
export const unsubscribeLanding = async (req: Request, res: Response): Promise<void> => {
  const payload = verifyToken<{ e: string; r?: string | null; c?: string | null }>(
    String(req.params.token || '')
  );
  if (!payload || !payload.e) {
    res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid or has expired.'));
    return;
  }
  void recordUnsubscribe(payload, 'link', clientMeta(req)).catch(() => {});
  res
    .status(200)
    .send(
      page(
        'Unsubscribed',
        `<strong>${escapeHtml(payload.e)}</strong> has been removed from our mailing list. You will no longer receive marketing emails from Hire Adda.`
      )
    );
};

/** Double-opt-in confirmation landing: GET /confirm/:token. */
export const confirm = async (req: Request, res: Response): Promise<void> => {
  const payload = verifyToken<{ e: string; a?: string }>(String(req.params.token || ''));
  if (!payload || !payload.e) {
    res.status(400).send(page('Invalid link', 'This confirmation link is invalid or has expired.'));
    return;
  }
  await confirmSubscription(payload.e).catch(() => {});
  res
    .status(200)
    .send(
      page(
        'Subscription confirmed',
        `<strong>${escapeHtml(payload.e)}</strong> is now subscribed. Thank you!`
      )
    );
};

/** Public preference center: GET /preferences/:token (optional ?action=unsubscribe|resubscribe). */
export const preferences = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token || '');
  const payload = verifyToken<{ e: string; r?: string | null; c?: string | null }>(token);
  if (!payload || !payload.e) {
    res.status(400).send(page('Invalid link', 'This preferences link is invalid or has expired.'));
    return;
  }
  const action = String(req.query.action || '');
  if (action === 'unsubscribe') {
    await recordUnsubscribe(
      { e: payload.e, r: payload.r ?? null, c: payload.c ?? null },
      'link',
      clientMeta(req)
    ).catch(() => {});
  } else if (action === 'resubscribe') {
    await resubscribe(payload.e).catch(() => {});
  }
  const state = await getSubscriptionState(payload.e);
  res.status(200).send(preferencesPage(payload.e, state?.status ?? 'UNKNOWN', token, !!action));
};

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c
  );

function preferencesPage(email: string, status: string, token: string, updated: boolean): string {
  const base = `/api/v1/webhooks/email/preferences/${encodeURIComponent(token)}`;
  const subscribed = status === 'SUBSCRIBED';
  const body = `
    ${updated ? '<p style="color:#059669;font-size:14px;margin:0 0 14px">Your preferences have been updated.</p>' : ''}
    <p style="font-size:15px;color:#4b5563;margin:0 0 8px">Email: <strong>${escapeHtml(email)}</strong></p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Current status: <strong>${escapeHtml(status)}</strong></p>
    ${
      subscribed
        ? `<a href="${base}?action=unsubscribe" style="display:inline-block;padding:12px 28px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Unsubscribe from all emails</a>`
        : `<a href="${base}?action=resubscribe" style="display:inline-block;padding:12px 28px;background:#2563EB;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Resubscribe</a>`
    }`;
  return page('Email preferences', body);
}

function page(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Hire Adda</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;max-width:480px;padding:40px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:22px;color:#111827;margin:0 0 12px}p{font-size:15px;color:#4b5563;line-height:1.6;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

/* ══════════ Notification digest opt-out (separate from campaigns) ══════════ */

/**
 * RFC 8058 one-click: POST /n/u/:token
 *
 * Providers (Gmail, Yahoo) POST this with no user interaction, so it must be
 * fast, side-effect-idempotent, and must NOT require auth or a confirmation
 * step. A 200 is required even when we cannot act, or the provider marks the
 * unsubscribe as failing and may downgrade sender reputation.
 */
export const notificationUnsubscribeOneClick = async (
  req: Request,
  res: Response
): Promise<void> => {
  const payload = verifyToken<{ u: string; k?: string }>(String(req.params.token || ''));
  if (!payload?.u) {
    res.status(400).send('Invalid unsubscribe link');
    return;
  }
  const { optOutOfDigest } = await import('../services/notification-optout.service');
  void optOutOfDigest(payload.u, payload.k).catch(() => {});
  res.status(200).send('You have been unsubscribed.');
};

/** Human landing: GET /n/u/:token — acts, then explains exactly what stopped. */
export const notificationUnsubscribeLanding = async (
  req: Request,
  res: Response
): Promise<void> => {
  const payload = verifyToken<{ u: string; k?: string }>(String(req.params.token || ''));
  if (!payload?.u) {
    res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid or has expired.'));
    return;
  }
  const { optOutOfDigest } = await import('../services/notification-optout.service');
  const result = await optOutOfDigest(payload.u, payload.k);
  if (!result.ok) {
    res
      .status(200)
      .send(
        page(
          'Something went wrong',
          'We could not update your preferences. Please try from your account settings.'
        )
      );
    return;
  }
  res
    .status(200)
    .send(
      page(
        'Unsubscribed',
        `You will no longer receive <strong>${result.what}</strong>. Account, security and application updates are unaffected — you can change this any time in your notification settings.`
      )
    );
};
