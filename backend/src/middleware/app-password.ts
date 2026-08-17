import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { AppError } from './error';
import { env } from '../config/env';
import { asyncHandler } from '../utils/async-handler';

/**
 * Single app-level password.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This module replaces the entire auth stack that came from the host
 * application — users, roles, sessions, refresh tokens, OAuth, WebAuthn, MFA,
 * RBAC and PBAC. There are still no accounts: a password gates the whole thing.
 *
 * ── The req.user shim ──
 * 25 call sites across the WhatsApp controllers read `req.user!.id` to stamp
 * `createdBy`, `actorUserId` and `performedBy`. Rather than edit all of them —
 * and rather than make those columns nullable — this middleware sets a
 * synthetic actor. The columns are plain strings with no foreign key (the User
 * relations were removed from the schema), so a label is a valid value and
 * every existing call site keeps working untouched.
 *
 * ── Named operators ──
 * That label is no longer one constant for everybody. OPERATOR_PASSWORDS holds
 * a password per person (`alice:…,bob:…`), and the label stamped on every row
 * is decided by WHICH password unlocked the session — never by anything the
 * caller asserts about itself. Sign-in signs the label into the token, so a
 * team of ten stops producing an audit trail that says `operator` ten times
 * over, and a conversation can be assigned to somebody who actually exists.
 *
 * Deliberately not a user table: no seats to provision, no reset flow, no
 * migration. Removing a leaver is deleting their entry — their outstanding
 * sessions stop verifying (see verifyToken), which is the per-person revocation
 * SESSION_EPOCH could only ever do for the whole team at once.
 *
 * APP_PASSWORD keeps working and keeps stamping OPERATOR_LABEL (default
 * `operator`), so a deployment that names nobody behaves exactly as before.
 */

const COOKIE_NAME = 'wa_unlock';

/** The shared account behind APP_PASSWORD. Not a user record — nothing points at it. */
export const APP_ACTOR = {
  id: env.OPERATOR_LABEL || 'operator',
  role: 'ADMIN' as const,
};

function secret(): string {
  const s = env.APP_PASSWORD;
  if (!s) {
    // Fail closed. An unset password must never mean "everyone is allowed".
    throw new AppError('APP_PASSWORD is not configured', 500, 'APP_PASSWORD_UNSET');
  }
  return s;
}

/** Default session lifetime when SESSION_MAX_AGE_SECONDS is unset: 12 hours. */
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Socket handshake tickets are deliberately tiny — the client refetches. */
const SOCKET_TICKET_TTL_SECONDS = 120;

function sessionTtlSeconds(): number {
  const raw = parseInt(env.SESSION_MAX_AGE_SECONDS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL_SECONDS;
}

/** Constant-time compare so a token cannot be probed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The operator roster
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * A label rides between two dots inside the token and travels in a cookie, so
 * the charset is narrow on purpose — and excludes `.` so a token always splits
 * into exactly two or three segments.
 */
export const OPERATOR_LABEL_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** Floor for a named operator's password — the same one APP_PASSWORD has. */
export const MIN_OPERATOR_PASSWORD_LENGTH = 16;

/**
 * Parse OPERATOR_PASSWORDS: `label:password` pairs, comma separated. The
 * password runs to the next comma, so it may contain colons and spaces.
 *
 * A malformed entry is DROPPED, not accepted loosely. Half-parsing one would
 * either produce a credential nobody can use or — far worse — one that is not
 * the credential the deployment believes it configured. env.ts refuses to boot
 * on the same input, so this is the second line of one rule rather than a
 * silent policy of its own.
 */
export function parseOperatorPasswords(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of (raw ?? '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const label = trimmed.slice(0, colon).trim();
    const password = trimmed.slice(colon + 1);
    if (!OPERATOR_LABEL_PATTERN.test(label)) continue;
    if (password.length < MIN_OPERATOR_PASSWORD_LENGTH) continue;
    // A second password for the shared label would make the audit trail lie
    // about which credential was used, and revoking one would revoke neither.
    if (label === APP_ACTOR.id || out.has(label)) continue;
    out.set(label, password);
  }
  return out;
}

/** Memoised on the raw string, so a changed environment is re-read rather than cached. */
let rosterCache: { raw: string; parsed: Map<string, string> } | null = null;
function roster(): Map<string, string> {
  const raw = env.OPERATOR_PASSWORDS ?? '';
  if (!rosterCache || rosterCache.raw !== raw) {
    rosterCache = { raw, parsed: parseOperatorPasswords(raw) };
  }
  return rosterCache.parsed;
}

/** Every label this deployment can stamp, the shared account first. */
export function listOperators(): string[] {
  return [APP_ACTOR.id, ...roster().keys()];
}

/** True while `label` is an operator this deployment still recognises. */
export function isKnownOperator(label: string): boolean {
  return label === APP_ACTOR.id || roster().has(label);
}

/**
 * Which operator a presented password belongs to, or null when it is not a
 * credential at all.
 *
 * Every candidate is compared even after a match: returning early would make
 * the response time a function of a password's position in the roster, which is
 * a weak oracle but a free one to avoid.
 */
export function resolveOperator(password: string): string | null {
  let matched: string | null = safeEqual(password, secret()) ? APP_ACTOR.id : null;
  for (const [label, candidate] of roster()) {
    if (safeEqual(password, candidate) && matched === null) matched = label;
  }
  return matched;
}

/** The signed message. The label is inside it, so it cannot be edited in transit. */
function tokenMessage(scope: string, exp: number, label: string | null): string {
  const epoch = env.SESSION_EPOCH || '1';
  const base = `wa-${scope}-v${epoch}|${exp}`;
  return label === null ? base : `${base}|${label}`;
}

/**
 * Mint a `<expiresAtMs>.<hmac>` token — or `<expiresAtMs>.<operator>.<hmac>`
 * when a named operator owns it.
 *
 * The expiry is INSIDE the signed message, so the server enforces it. The
 * previous token was `HMAC(password, 'wa-unlock-v<epoch>')` — a constant with no
 * timestamp and no nonce, valid forever. The only lifetime control was the
 * cookie's `maxAge`, which is a hint to the browser: anyone who captured the
 * value (from a shared machine, a proxy log, a copied cURL) held a credential
 * that worked until someone thought to bump SESSION_EPOCH. The advertised "12h
 * session" was 12h of browser politeness and unlimited server-side validity.
 *
 * The operator is signed in for the same reason the expiry is: whoever holds
 * the cookie must not get to choose the name the audit trail records. The
 * shared account keeps the exact two-segment token it has always been given, so
 * turning the roster on does not sign the existing team out.
 *
 * `scope` separates credentials that must not be interchangeable — an unlock
 * cookie and a socket handshake ticket sign different messages, so a ticket
 * handed to page JavaScript is NOT accepted by requireAppPassword.
 */
function mintToken(scope: string, ttlSeconds: number, operator?: string | null): string {
  const exp = Date.now() + ttlSeconds * 1000;
  const label = operator && operator !== APP_ACTOR.id ? operator : null;
  const mac = crypto
    .createHmac('sha256', secret())
    .update(tokenMessage(scope, exp, label))
    .digest('hex');
  return label === null ? `${exp}.${mac}` : `${exp}.${label}.${mac}`;
}

/**
 * Verify a token minted by {@link mintToken}: shape, expiry, roster, signature.
 *
 * Returns the operator the token names, or null when it is not valid. Callers
 * need that label to stamp rows with it, and answering "is this valid" and "who
 * is this" from two separate lookups is how the two answers drift apart.
 *
 * The roster check is what makes deleting a leaver from OPERATOR_PASSWORDS
 * actually lock them out: their signature stays perfectly good, so nothing else
 * would stop the cookie already in their browser until it expired on its own.
 */
function verifyToken(scope: string, token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2 || parts.length > 3) return null;
  const label = parts.length === 3 ? parts[1] : null;
  const mac = parts[parts.length - 1];
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  if (label !== null && !isKnownOperator(label)) return null;

  const expected = crypto
    .createHmac('sha256', secret())
    .update(tokenMessage(scope, exp, label))
    .digest('hex');
  return safeEqual(mac, expected) ? (label ?? APP_ACTOR.id) : null;
}

/**
 * Issue the value stored in the unlock cookie: a signed, expiring HMAC of the
 * password — never the password itself.
 *
 * SESSION_EPOCH is part of the signed message, so bumping it invalidates every
 * outstanding cookie and socket immediately while APP_PASSWORD stays the same.
 */
export function issueUnlockToken(operator?: string | null): {
  token: string;
  expiresInSeconds: number;
} {
  const ttl = sessionTtlSeconds();
  return { token: mintToken('unlock', ttl, operator), expiresInSeconds: ttl };
}

/** The operator a currently-valid unlock token names, or null. */
export function verifyUnlockToken(token: unknown): string | null {
  return verifyToken('unlock', token);
}

/**
 * Issue a short-lived Socket.IO handshake ticket.
 *
 * The BFF used to hand the browser the unlock cookie's exact value so
 * Socket.IO could put it in `handshake.auth` — which meant page JavaScript held
 * the full session bearer credential, defeating the point of the cookie being
 * httpOnly. This ticket is scoped: it opens a socket, and `requireAppPassword`
 * rejects it. It lives two minutes; the client refetches on reconnect.
 */
export function issueSocketTicket(operator?: string | null): {
  ticket: string;
  expiresInSeconds: number;
} {
  return {
    ticket: mintToken('socket', SOCKET_TICKET_TTL_SECONDS, operator),
    expiresInSeconds: SOCKET_TICKET_TTL_SECONDS,
  };
}

/** The operator a currently-valid socket handshake ticket names, or null. */
export function verifySocketTicket(ticket: unknown): string | null {
  return verifyToken('socket', ticket);
}

/** How long an operator has to produce their second factor. */
const MFA_PENDING_TTL_SECONDS = 5 * 60;

/**
 * Issue the half-authenticated token handed out after a correct password when
 * MFA is enabled.
 *
 * This is what makes the second factor mean something. hire_adda has no
 * intermediate state at all: it answers `{requireMfa:true}` with no token, and
 * the client re-POSTs the entire email+password alongside the code — so the
 * password crosses the wire twice per login and nothing downstream can tell a
 * session that passed TOTP from one that did not.
 *
 * A pending token proves "this caller knew the password, just now" and NOTHING
 * else. It is scoped, so `requireAppPassword` rejects it on every route: the
 * only thing it opens is the verify endpoint.
 */
export function issueMfaPendingToken(operator?: string | null): {
  token: string;
  expiresInSeconds: number;
} {
  return {
    token: mintToken('mfa-pending', MFA_PENDING_TTL_SECONDS, operator),
    expiresInSeconds: MFA_PENDING_TTL_SECONDS,
  };
}

/**
 * The operator a currently-valid MFA challenge token names, or null.
 *
 * Step 2 issues the session for THAT label, so a second factor cannot be used
 * to finish somebody else's sign-in.
 */
export function verifyMfaPendingToken(token: unknown): string | null {
  return verifyToken('mfa-pending', token);
}

/** Stamp the resolved operator where the 25 `req.user!.id` call sites read it. */
function setActor(req: Request, id: string): void {
  (req as Request & { user?: typeof APP_ACTOR }).user = { id, role: APP_ACTOR.role };
}

/**
 * Gate every operator route. Accepts either the unlock cookie or a
 * `X-App-Password` header, so scripts and webhook testers can authenticate
 * without a browser session.
 */
export const requireAppPassword = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
    const header = req.header('X-App-Password');

    // A socket ticket is deliberately NOT accepted here — see issueSocketTicket.
    // A session cookie can only exist if every factor was satisfied at sign-in.
    const cookieOperator = verifyUnlockToken(cookie);
    if (cookieOperator) {
      setActor(req, cookieOperator);
      return next();
    }

    // Not "is this the password" but "whose password is this" — with a roster
    // configured those are different questions, and the answer is the label
    // every row this request touches gets stamped with.
    const headerOperator = header ? resolveOperator(header) : null;
    if (headerOperator) {
      /**
       * The raw-password header is a COMPLETE MFA BYPASS unless it is gated.
       *
       * It exists so scripts and webhook testers can authenticate without a
       * browser session, and it is checked against the passwords directly — so
       * once MFA is enabled, anyone holding one could still reach every
       * operator route (read every conversation, message every customer, export
       * the contact list) having never presented a second factor. Turning MFA on
       * while leaving this open buys almost nothing.
       *
       * So: when MFA is on, the header alone is refused. A deployment that truly
       * needs the script path can re-open it with
       * ALLOW_PASSWORD_HEADER_WITH_MFA=true, which is an explicit, auditable
       * decision to accept one factor for API callers rather than an accident.
       */
      const { isMfaEnabled } = await import('../services/whatsapp-mfa.service');
      if ((await isMfaEnabled()) && env.ALLOW_PASSWORD_HEADER_WITH_MFA !== 'true') {
        return next(
          new AppError(
            'Two-factor authentication is enabled, so the X-App-Password header is not ' +
              'sufficient on its own. Sign in through the console, or set ' +
              'ALLOW_PASSWORD_HEADER_WITH_MFA=true to allow single-factor API access.',
            401,
            'MFA_REQUIRED'
          )
        );
      }
      setActor(req, headerOperator);
      return next();
    }

    next(new AppError('Locked. Provide the app password.', 401, 'LOCKED'));
  }
);

/**
 * Auth for the Prometheus scrape endpoint.
 *
 * Accepts `Authorization: Bearer <METRICS_TOKEN>` when one is configured, and
 * otherwise falls through to the normal operator gate so a browser can still open
 * /metrics. Compared in constant time — a timing oracle on a long-lived static
 * token is worth avoiding even on an internal endpoint.
 */
export const requireMetricsToken: RequestHandler = (req, res, next) => {
  const configured = env.METRICS_TOKEN;
  if (configured) {
    const header = req.header('authorization') ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
    const a = Buffer.from(presented);
    const b = Buffer.from(configured);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      // A scrape is the deployment's own monitoring, not a person, so it is the
      // shared account rather than any named operator.
      setActor(req, APP_ACTOR.id);
      return next();
    }
  }
  return requireAppPassword(req, res, next);
};

/** Actor stamped on rows created by a server-to-server integration. */
export const CONVERSION_API_ACTOR = { id: 'conversion-api', role: 'ADMIN' as const };

/**
 * Auth for the server-to-server conversion ingest route.
 *
 * Its own credential, NOT the app password and NOT a fallback to it: the whole
 * point is that a website or CRM can report a conversion without being handed
 * the one secret that unlocks the console. Fails closed when unset — no key
 * configured means the route is off, never "open to anyone".
 *
 * Constant-time compare against a header, like every other static token here.
 */
export const requireConversionApiKey: RequestHandler = (req, _res, next) => {
  const configured = env.WA_CONVERSION_API_KEY;
  if (!configured) {
    return next(
      new AppError(
        'Conversion ingest is not configured (WA_CONVERSION_API_KEY unset)',
        503,
        'WA_CONVERSION_API_DISABLED'
      )
    );
  }
  const presented =
    req.header('x-conversion-key') ??
    (req.header('authorization')?.startsWith('Bearer ')
      ? (req.header('authorization') as string).slice(7)
      : '');
  const a = Buffer.from(presented);
  const b = Buffer.from(configured);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    (req as Request & { user?: typeof CONVERSION_API_ACTOR }).user = CONVERSION_API_ACTOR;
    return next();
  }
  return next(new AppError('Invalid conversion API key', 401, 'WA_CONVERSION_API_UNAUTHORIZED'));
};

export const UNLOCK_COOKIE = COOKIE_NAME;
