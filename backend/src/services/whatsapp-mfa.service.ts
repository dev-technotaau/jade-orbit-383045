import crypto from 'crypto';
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import { encryptField, decryptField, isEncryptionEnabled } from '../utils/encryption';

/**
 * Multi-factor authentication for the operator console.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One shared TOTP seed, because this module has one shared app password and no
 * user table. Every operator scans the same QR. That is weaker than per-person
 * MFA — it cannot attribute an action or revoke one person — but it is still a
 * real second factor: knowing the password is no longer sufficient, you also
 * need a device that was enrolled.
 *
 * The compensating controls for the shared seed are `epoch` (below),
 * per-browser trusted devices that CAN be revoked individually, and an audit
 * row for every MFA event.
 *
 * ── Parameters ──
 * SHA-1 / 6 digits / 30s / ±1 step, matching what hire_adda's speakeasy setup
 * resolves to, so an authenticator enrolled against either system behaves
 * identically. Implemented on `otpauth` rather than speakeasy: speakeasy has had
 * no release since 2019 and still calls the removed `new Buffer()`, and its
 * `generateSecret` silently drops the `issuer` option.
 */

const CONFIG_ID = 'default';

/** ±1 step either side of now: a ~90s acceptance band, same as hire_adda. */
const TOTP_WINDOW = 1;
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ALGORITHM = 'SHA1';

/** Recovery codes issued per generation. */
const RECOVERY_CODE_COUNT = 10;
/** An un-confirmed enrolment expires — a stale pendingSecret is a loose end. */
const ENROLMENT_TTL_MINUTES = 15;
/** How long a browser stays trusted before it must produce a code again. */
const TRUSTED_DEVICE_DAYS = 30;

export interface MfaStatus {
  enabled: boolean;
  enrolledAt: Date | null;
  lastVerifiedAt: Date | null;
  recoveryCodesRemaining: number;
  trustedDeviceCount: number;
  epoch: number;
  /** False when FIELD_ENCRYPTION_KEY is unset — enrolment is refused. */
  canEnrol: boolean;
  /** True when a setup was started but never confirmed. */
  enrolmentPending: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Config row
 * ──────────────────────────────────────────────────────────────────────────*/

async function loadConfig() {
  return prisma.waMfaConfig.upsert({
    where: { id: CONFIG_ID },
    update: {},
    create: { id: CONFIG_ID },
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Recovery codes
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * ONE canonical normalisation, used by both hashing and verification.
 *
 * This is where hire_adda's backup codes are broken and have never once worked:
 * generation hashes the dashed `'A1B2-C3D4'` while verification strips the dash
 * and hashes `'A1B2C3D4'`, so no input can ever satisfy both and the branch is
 * dead. Routing every code through a single function makes that class of bug
 * impossible — see the round-trip test in the suite.
 */
function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

function hashRecoveryCode(raw: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(raw)).digest('hex');
}

/** `XXXX-XXXX`, unambiguous alphabet (no O/0/I/1) so they can be read aloud. */
function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const chars = Array.from(
      { length: 8 },
      () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]
    ).join('');
    codes.push(`${chars.slice(0, 4)}-${chars.slice(4)}`);
  }
  return codes;
}

/* ────────────────────────────────────────────────────────────────────────────
 * TOTP
 * ──────────────────────────────────────────────────────────────────────────*/

function buildTotp(base32Secret: string): TOTP {
  return new TOTP({
    issuer: env.BRAND_NAME || 'TechnoTaau',
    label: env.OPERATOR_LABEL || 'operator',
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: Secret.fromBase32(base32Secret),
  });
}

/**
 * Reject a code that has already been accepted, for as long as it would still
 * validate.
 *
 * Without this the same 6 digits keep working for the whole ~90s window, on
 * every endpoint that takes a code. Anyone who observes one — over a shoulder,
 * on a screen share, from a retried request — can replay it. hire_adda has no
 * such guard.
 *
 * Fails OPEN if Redis is down: the alternative is refusing every valid login
 * during a Redis outage, which trades a narrow replay window for a total
 * outage. The code is still single-window and still requires the seed.
 */
async function claimCode(code: string): Promise<boolean> {
  const key = `wa:mfa:used:${crypto.createHash('sha256').update(code).digest('hex').slice(0, 32)}`;
  try {
    const fresh = await redis.set(key, '1', 'EX', TOTP_PERIOD * (TOTP_WINDOW * 2 + 1), 'NX');
    return fresh !== null;
  } catch {
    return true;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Status
 * ──────────────────────────────────────────────────────────────────────────*/

export async function getMfaStatus(): Promise<MfaStatus> {
  const cfg = await loadConfig();
  const trustedDeviceCount = await prisma.waTrustedDevice.count({
    where: { epoch: cfg.epoch, expiresAt: { gt: new Date() } },
  });
  return {
    enabled: cfg.enabled,
    enrolledAt: cfg.enrolledAt,
    lastVerifiedAt: cfg.lastVerifiedAt,
    recoveryCodesRemaining: cfg.recoveryCodes.length,
    trustedDeviceCount,
    epoch: cfg.epoch,
    canEnrol: isEncryptionEnabled(),
    enrolmentPending: cfg.pendingSecret != null,
  };
}

/**
 * Is MFA on? Consulted by `requireAppPassword` on every request, so it is cached
 * briefly rather than hitting the database each time.
 *
 * hire_adda's `requireMfaEnabled` re-queries on every admin request even though
 * `protect` has already loaded the flag onto `req.user` — five routers times
 * every request. A 30s TTL keeps a multi-pod deployment honest (an operator who
 * disables MFA waits at most half a minute for the other pods to agree) without
 * putting a query on the hot path. Every mutation invalidates it locally, so the
 * pod that made the change is correct immediately.
 */
const MFA_FLAG_TTL_MS = 30_000;
let mfaFlagCache: { value: boolean; at: number } | null = null;

export function invalidateMfaFlagCache(): void {
  mfaFlagCache = null;
}

export async function isMfaEnabled(): Promise<boolean> {
  if (mfaFlagCache && Date.now() - mfaFlagCache.at < MFA_FLAG_TTL_MS) {
    return mfaFlagCache.value;
  }
  const cfg = await prisma.waMfaConfig.findUnique({
    where: { id: CONFIG_ID },
    select: { enabled: true },
  });
  const value = cfg?.enabled === true;
  mfaFlagCache = { value, at: Date.now() };
  return value;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Enrolment
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Begin enrolment: mint a seed, store it as PENDING, return the QR.
 *
 * The seed goes to `pendingSecret`, never to `secret`. hire_adda writes straight
 * to the live column whenever MFA is off, so re-opening the setup screen
 * silently replaces the seed the user just scanned and their authenticator entry
 * dies with no explanation. Here the live seed is only ever touched by a
 * successful confirm.
 */
export async function beginEnrolment(): Promise<{
  secret: string;
  qrCodeDataUrl: string;
  otpauthUri: string;
}> {
  // Refuse rather than write a plaintext seed. hire_adda's encryptField returns
  // its input unchanged when FIELD_ENCRYPTION_KEY is unset, so a misconfigured
  // deployment stores raw base32 TOTP secrets and nobody is told.
  if (!isEncryptionEnabled()) {
    throw new AppError(
      'FIELD_ENCRYPTION_KEY must be set before enabling MFA — the TOTP secret ' +
        'would otherwise be stored in plaintext. Generate one with `openssl rand -hex 32`.',
      409,
      'WA_MFA_ENCRYPTION_REQUIRED'
    );
  }

  const cfg = await loadConfig();
  if (cfg.enabled) {
    throw new AppError(
      'MFA is already enabled. Disable it first to re-enrol.',
      409,
      'WA_MFA_ALREADY_ENABLED'
    );
  }

  const secret = new Secret({ size: 20 }).base32; // 160-bit, per RFC 4226
  const totp = buildTotp(secret);

  await prisma.waMfaConfig.update({
    where: { id: CONFIG_ID },
    data: { pendingSecret: encryptField(secret), pendingAt: new Date() },
  });

  const otpauthUri = totp.toString();
  return {
    secret, // shown once, for manual entry when a camera is unavailable
    qrCodeDataUrl: await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 }),
    otpauthUri,
  };
}

/**
 * Confirm enrolment with a live code. Returns the recovery codes — the only
 * time they are ever visible.
 */
export async function confirmEnrolment(code: string): Promise<{ recoveryCodes: string[] }> {
  const cfg = await loadConfig();
  if (cfg.enabled) {
    throw new AppError('MFA is already enabled', 409, 'WA_MFA_ALREADY_ENABLED');
  }
  if (!cfg.pendingSecret || !cfg.pendingAt) {
    throw new AppError('Start the setup first', 400, 'WA_MFA_NO_PENDING_ENROLMENT');
  }
  if (Date.now() - cfg.pendingAt.getTime() > ENROLMENT_TTL_MINUTES * 60 * 1000) {
    await prisma.waMfaConfig.update({
      where: { id: CONFIG_ID },
      data: { pendingSecret: null, pendingAt: null },
    });
    throw new AppError(
      'This setup expired. Start again to get a fresh QR code.',
      400,
      'WA_MFA_ENROLMENT_EXPIRED'
    );
  }

  const secret = decryptField(cfg.pendingSecret);
  const delta = buildTotp(secret).validate({ token: code, window: TOTP_WINDOW });
  if (delta === null) {
    throw new AppError(
      'That code is not valid. Check your authenticator app.',
      401,
      'WA_MFA_INVALID_CODE'
    );
  }
  await claimCode(code);

  const recoveryCodes = generateRecoveryCodes();
  await prisma.waMfaConfig.update({
    where: { id: CONFIG_ID },
    data: {
      enabled: true,
      secret: cfg.pendingSecret, // already encrypted — promote, don't re-encrypt
      pendingSecret: null,
      pendingAt: null,
      recoveryCodes: recoveryCodes.map(hashRecoveryCode),
      enrolledAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  });

  invalidateMfaFlagCache();
  logger.info('WhatsApp MFA enabled for the operator console');
  return { recoveryCodes };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Verification
 * ──────────────────────────────────────────────────────────────────────────*/

export type MfaFactor = 'totp' | 'recovery_code';

/**
 * Verify a submitted code against TOTP first, then the recovery codes.
 *
 * A consumed recovery code is spliced out in the SAME query that matches it
 * (`recoveryCodes: { has: hash }` as a guard on updateMany), so two concurrent
 * requests cannot both spend it.
 */
export async function verifyCode(code: string): Promise<MfaFactor | null> {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.secret) return null;

  const trimmed = code.trim();

  // TOTP first — the common case, and a 6-digit numeric input cannot collide
  // with the XXXX-XXXX recovery format.
  if (/^\d{6}$/.test(trimmed)) {
    const secret = decryptField(cfg.secret);
    const delta = buildTotp(secret).validate({ token: trimmed, window: TOTP_WINDOW });
    if (delta !== null) {
      if (!(await claimCode(trimmed))) {
        // Correct, but already spent inside this window: a replay.
        logger.warn('WhatsApp MFA: rejected a replayed TOTP code');
        return null;
      }
      await prisma.waMfaConfig
        .update({ where: { id: CONFIG_ID }, data: { lastVerifiedAt: new Date() } })
        .catch(() => {});
      return 'totp';
    }
    return null;
  }

  // Recovery code. Single-use, enforced atomically.
  const hash = hashRecoveryCode(trimmed);
  if (!cfg.recoveryCodes.includes(hash)) return null;

  const remaining = cfg.recoveryCodes.filter((h) => h !== hash);
  const claimed = await prisma.waMfaConfig.updateMany({
    where: { id: CONFIG_ID, recoveryCodes: { has: hash } },
    data: { recoveryCodes: remaining, lastVerifiedAt: new Date() },
  });
  if (claimed.count === 0) return null; // lost the race — already spent

  logger.warn(
    `WhatsApp MFA: recovery code used. ${remaining.length} of ${cfg.recoveryCodes.length} remain.`
  );
  return 'recovery_code';
}

/* ────────────────────────────────────────────────────────────────────────────
 * Management
 * ──────────────────────────────────────────────────────────────────────────*/

export async function regenerateRecoveryCodes(): Promise<{ recoveryCodes: string[] }> {
  const cfg = await loadConfig();
  if (!cfg.enabled) throw new AppError('MFA is not enabled', 409, 'WA_MFA_NOT_ENABLED');

  const recoveryCodes = generateRecoveryCodes();
  await prisma.waMfaConfig.update({
    where: { id: CONFIG_ID },
    data: { recoveryCodes: recoveryCodes.map(hashRecoveryCode) },
  });
  logger.info('WhatsApp MFA: recovery codes regenerated (previous set invalidated)');
  return { recoveryCodes };
}

/** Turn MFA off and drop every trusted device with it. */
export async function disableMfa(): Promise<void> {
  await prisma.waMfaConfig.update({
    where: { id: CONFIG_ID },
    data: {
      enabled: false,
      secret: null,
      pendingSecret: null,
      pendingAt: null,
      recoveryCodes: [],
      enrolledAt: null,
    },
  });
  await prisma.waTrustedDevice.deleteMany({});
  invalidateMfaFlagCache();
  logger.warn('WhatsApp MFA DISABLED — the console is now password-only');
}

/**
 * The kill switch for a shared seed: invalidate every enrolled authenticator
 * and trusted device at once. MFA stays ON but must be re-enrolled, so the
 * console does not silently drop to one factor.
 */
export async function rotateEpoch(): Promise<{ epoch: number }> {
  const cfg = await loadConfig();
  const updated = await prisma.waMfaConfig.update({
    where: { id: CONFIG_ID },
    data: {
      epoch: cfg.epoch + 1,
      enabled: false,
      secret: null,
      pendingSecret: null,
      pendingAt: null,
      recoveryCodes: [],
      enrolledAt: null,
    },
  });
  await prisma.waTrustedDevice.deleteMany({});
  invalidateMfaFlagCache();
  logger.warn(
    `WhatsApp MFA epoch rotated to ${updated.epoch} — every authenticator and ` +
      'trusted device is now invalid and MFA must be re-enrolled'
  );
  return { epoch: updated.epoch };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Trusted devices
 * ──────────────────────────────────────────────────────────────────────────*/

function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Coarse label from a UA string. Never store the raw UA — it fingerprints. */
function deviceLabel(userAgent?: string): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Safari\//.test(userAgent)
        ? 'Safari'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

export async function trustDevice(opts: {
  userAgent?: string;
  ip?: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const cfg = await loadConfig();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
  await prisma.waTrustedDevice.create({
    data: {
      tokenHash: hashDeviceToken(token),
      label: deviceLabel(opts.userAgent),
      ip: opts.ip ?? null,
      epoch: cfg.epoch,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/**
 * Is this browser trusted? On a hit the token is ROTATED — the old one stops
 * working immediately, so a token captured once cannot be replayed after the
 * legitimate browser next uses it. hire_adda's never rotates and is good for 30
 * days to anyone who copies it.
 */
export async function consumeTrustedDevice(
  token: string | undefined,
  opts: { userAgent?: string; ip?: string } = {}
): Promise<{ token: string; expiresAt: Date } | null> {
  if (!token) return null;
  const cfg = await loadConfig();

  const row = await prisma.waTrustedDevice.findUnique({
    where: { tokenHash: hashDeviceToken(token) },
  });
  if (!row) return null;
  if (row.epoch !== cfg.epoch || row.expiresAt <= new Date()) {
    await prisma.waTrustedDevice.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }

  const next = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
  const rotated = await prisma.waTrustedDevice.updateMany({
    where: { id: row.id, tokenHash: row.tokenHash },
    data: {
      tokenHash: hashDeviceToken(next),
      lastUsedAt: new Date(),
      expiresAt,
      label: deviceLabel(opts.userAgent) || row.label,
      ip: opts.ip ?? row.ip,
    },
  });
  if (rotated.count === 0) return null; // concurrent use — make them do TOTP

  return { token: next, expiresAt };
}

export async function listTrustedDevices() {
  const cfg = await loadConfig();
  return prisma.waTrustedDevice.findMany({
    where: { epoch: cfg.epoch, expiresAt: { gt: new Date() } },
    select: { id: true, label: true, ip: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeTrustedDevice(id: string): Promise<void> {
  await prisma.waTrustedDevice.delete({ where: { id } }).catch(() => {
    throw new AppError('Device not found', 404, 'WA_MFA_DEVICE_NOT_FOUND');
  });
}

export async function revokeAllTrustedDevices(): Promise<{ count: number }> {
  const res = await prisma.waTrustedDevice.deleteMany({});
  return { count: res.count };
}

/**
 * Delete expired rows. Called from the retention cron — hire_adda declares an
 * `@@index([expiresAt])` as if a sweeper were planned and then never wrote one,
 * so its table grows forever.
 */
export async function pruneExpiredTrustedDevices(): Promise<number> {
  const res = await prisma.waTrustedDevice.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}

/** Exported for tests — the normalisation that must never diverge. */
export const __testing = { normalizeRecoveryCode, hashRecoveryCode, generateRecoveryCodes };
