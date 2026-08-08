import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { encryptField, decryptField, isEncryptionEnabled } from '../utils/encryption';
import { evictImap, type ImapCreds } from './email-imap-pool';
import { stopAccountWatchers } from './email-idle.service';
import type { EmailAccount } from '@prisma/client';

/**
 * CRUD + credential handling for personal IMAP/SMTP mailboxes used by the
 * one-on-one webmail client. Passwords are AES-256-GCM encrypted at rest and
 * never leave the backend — API responses are always redacted.
 */

export interface AccountInput {
  name: string;
  email: string;
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser: string;
  imapPass?: string; // omitted on update = keep existing
  smtpHost: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPass?: string;
  signature?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

export type RedactedAccount = Omit<EmailAccount, 'imapPassEnc' | 'smtpPassEnc'> & {
  hasImapPass: boolean;
  hasSmtpPass: boolean;
};

export function redactAccount(a: EmailAccount): RedactedAccount {
  const { imapPassEnc, smtpPassEnc, ...rest } = a;
  return { ...rest, hasImapPass: Boolean(imapPassEnc), hasSmtpPass: Boolean(smtpPassEnc) };
}

/** Decrypted IMAP credentials for the pool. */
export function resolveImapCreds(a: EmailAccount): ImapCreds {
  return {
    id: a.id,
    host: a.imapHost,
    port: a.imapPort,
    secure: a.imapSecure,
    user: a.imapUser,
    pass: decryptField(a.imapPassEnc),
  };
}

export interface SmtpCreds {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export function resolveSmtpCreds(a: EmailAccount): SmtpCreds {
  return {
    host: a.smtpHost,
    port: a.smtpPort,
    secure: a.smtpSecure,
    user: a.smtpUser,
    pass: decryptField(a.smtpPassEnc),
    fromName: a.name,
    fromEmail: a.email,
  };
}

/**
 * Refuse to persist mailbox credentials in plaintext: these are reusable
 * passwords to third-party IMAP/SMTP accounts, so we require field encryption
 * rather than silently falling back like internal graceful-degradation paths.
 */
function requireEncryption(): void {
  if (!isEncryptionEnabled()) {
    throw new AppError(
      'Mailbox credential encryption is not configured (FIELD_ENCRYPTION_KEY missing)',
      503,
      'EMAIL_ENCRYPTION_UNAVAILABLE'
    );
  }
}

export async function listAccounts(userId: string): Promise<RedactedAccount[]> {
  const rows = await prisma.emailAccount.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(redactAccount);
}

/** Full row (with encrypted creds) — internal use only, ownership-checked. */
export async function getAccountRow(userId: string, id: string): Promise<EmailAccount> {
  const acc = await prisma.emailAccount.findFirst({ where: { id, userId } });
  if (!acc) throw new AppError('Mail account not found', 404, 'EMAIL_ACCOUNT_NOT_FOUND');
  return acc;
}

export async function getAccount(userId: string, id: string): Promise<RedactedAccount> {
  return redactAccount(await getAccountRow(userId, id));
}

export async function createAccount(userId: string, input: AccountInput): Promise<RedactedAccount> {
  requireEncryption();
  const imapPass = input.imapPass;
  const smtpPass = input.smtpPass;
  if (!imapPass)
    throw new AppError('IMAP password is required', 400, 'EMAIL_ACCOUNT_IMAP_PASS_REQUIRED');
  if (!smtpPass)
    throw new AppError('SMTP password is required', 400, 'EMAIL_ACCOUNT_SMTP_PASS_REQUIRED');

  const existing = await prisma.emailAccount.count({ where: { userId } });
  const makeDefault = input.isDefault ?? existing === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault)
      await tx.emailAccount.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.emailAccount.create({
      data: {
        userId,
        name: input.name,
        email: input.email.toLowerCase(),
        imapHost: input.imapHost,
        imapPort: input.imapPort ?? 993,
        imapSecure: input.imapSecure ?? true,
        imapUser: input.imapUser,
        imapPassEnc: encryptField(imapPass),
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort ?? 465,
        smtpSecure: input.smtpSecure ?? true,
        smtpUser: input.smtpUser,
        smtpPassEnc: encryptField(smtpPass),
        signature: input.signature ?? null,
        color: input.color ?? null,
        isDefault: makeDefault,
      },
    });
  });
  return redactAccount(created);
}

export async function updateAccount(
  userId: string,
  id: string,
  input: Partial<AccountInput>
): Promise<RedactedAccount> {
  await getAccountRow(userId, id); // ownership
  if (input.imapPass || input.smtpPass) requireEncryption();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email.toLowerCase();
  if (input.imapHost !== undefined) data.imapHost = input.imapHost;
  if (input.imapPort !== undefined) data.imapPort = input.imapPort;
  if (input.imapSecure !== undefined) data.imapSecure = input.imapSecure;
  if (input.imapUser !== undefined) data.imapUser = input.imapUser;
  if (input.imapPass) data.imapPassEnc = encryptField(input.imapPass);
  if (input.smtpHost !== undefined) data.smtpHost = input.smtpHost;
  if (input.smtpPort !== undefined) data.smtpPort = input.smtpPort;
  if (input.smtpSecure !== undefined) data.smtpSecure = input.smtpSecure;
  if (input.smtpUser !== undefined) data.smtpUser = input.smtpUser;
  if (input.smtpPass) data.smtpPassEnc = encryptField(input.smtpPass);
  if (input.signature !== undefined) data.signature = input.signature;
  if (input.color !== undefined) data.color = input.color;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.emailAccount.updateMany({ where: { userId }, data: { isDefault: false } });
      data.isDefault = true;
    }
    return tx.emailAccount.update({ where: { id }, data });
  });
  evictImap(id); // creds/host may have changed — drop the stale pooled connection
  stopAccountWatchers(id);
  return redactAccount(updated);
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const acc = await getAccountRow(userId, id);
  await prisma.emailAccount.delete({ where: { id } });
  evictImap(id);
  stopAccountWatchers(id);
  // Promote another account to default if we removed the default one.
  if (acc.isDefault) {
    const next = await prisma.emailAccount.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (next)
      await prisma.emailAccount.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

export interface ConnectivityResult {
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}

/**
 * Live connectivity probe. Accepts raw creds (create form) OR an existing
 * account id whose stored password is reused when a field is blank.
 */
export async function testConnectivity(
  userId: string,
  input: AccountInput & { id?: string }
): Promise<ConnectivityResult> {
  let imapPass = input.imapPass;
  let smtpPass = input.smtpPass;
  if (input.id && (!imapPass || !smtpPass)) {
    const existing = await getAccountRow(userId, input.id);
    if (!imapPass) imapPass = decryptField(existing.imapPassEnc);
    if (!smtpPass) smtpPass = decryptField(existing.smtpPassEnc);
  }

  const result: ConnectivityResult = { imap: { ok: false }, smtp: { ok: false } };

  // IMAP
  const client = new ImapFlow({
    host: input.imapHost,
    port: input.imapPort ?? 993,
    secure: input.imapSecure ?? true,
    auth: { user: input.imapUser, pass: imapPass ?? '' },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  try {
    await client.connect();
    await client.logout();
    result.imap.ok = true;
  } catch (err) {
    result.imap.error = err instanceof Error ? err.message : 'IMAP connection failed';
    try {
      await client.logout();
    } catch {
      /* already closed */
    }
  }

  // SMTP
  const transport = nodemailer.createTransport({
    host: input.smtpHost,
    port: input.smtpPort ?? 465,
    secure: input.smtpSecure ?? true,
    auth: { user: input.smtpUser, pass: smtpPass ?? '' },
    connectionTimeout: 15_000,
  });
  try {
    await transport.verify();
    result.smtp.ok = true;
  } catch (err) {
    result.smtp.error = err instanceof Error ? err.message : 'SMTP connection failed';
  } finally {
    transport.close();
  }

  // Record the outcome on the stored account, if any.
  if (input.id) {
    const lastError =
      result.imap.ok && result.smtp.ok
        ? null
        : result.imap.error || result.smtp.error || 'Connection failed';
    // Scope by userId too — never write another owner's account row (IDOR).
    await prisma.emailAccount
      .updateMany({ where: { id: input.id, userId }, data: { lastError, lastSyncAt: new Date() } })
      .catch(() => {});
  }

  return result;
}
