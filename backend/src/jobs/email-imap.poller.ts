import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import { env } from '../config/env';
import logger from '../config/logger';
import { ingestInbound, type InboundEmail } from '../services/email-inbound.service';

/**
 * Long-running IMAP poller (runs only on the worker leader). There are NO ESP
 * webhooks on the self-hosted MTA, so this is the sole ingestion path for
 * bounces (DSN), complaints (ARF), and human replies. Polls UNSEEN messages in
 * the bounce + replies mailboxes on a fixed interval, parses each with
 * mailparser, hands it to the inbound service, then marks it \Seen. Idempotent
 * end-to-end (dedup by Message-ID), so a re-poll never double-processes.
 */

let running = false;
let timer: NodeJS.Timeout | null = null;
let idleClient: ImapFlow | null = null;
let idleReconnectTimer: NodeJS.Timeout | null = null;
const MAX_PER_MAILBOX = 200;

function imapConfigured(): boolean {
  return !!(env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASS);
}

export function startEmailImapPoller(): void {
  if (running) return;
  if (!imapConfigured()) {
    logger.info('Email IMAP poller disabled (IMAP_HOST/USER/PASS not set)');
    return;
  }
  running = true;
  const interval = parseInt(env.IMAP_POLL_INTERVAL_MS, 10) || 60_000;
  logger.info(`Email IMAP poller started (every ${interval}ms)`);
  const tick = (): void => {
    void pollOnce()
      .catch((e) => logger.warn(`Email IMAP poll failed: ${(e as Error).message}`))
      .finally(() => {
        if (running) timer = setTimeout(tick, interval);
      });
  };
  tick();
  // Near-real-time push via IMAP IDLE on the replies mailbox; the interval poll
  // above is the fallback when IDLE is unsupported or the connection drops.
  void startIdle();
}

export async function stopEmailImapPoller(): Promise<void> {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (idleReconnectTimer) {
    clearTimeout(idleReconnectTimer);
    idleReconnectTimer = null;
  }
  if (idleClient) {
    const c = idleClient;
    idleClient = null;
    await c.logout().catch(() => {});
  }
}

/** Hold an IMAP IDLE connection on the replies mailbox; poll immediately on new mail. */
async function startIdle(): Promise<void> {
  if (!running || !imapConfigured() || idleClient) return;
  const mailbox = env.EMAIL_REPLIES_MAILBOX || 'INBOX';
  const client = new ImapFlow({
    host: env.IMAP_HOST as string,
    port: parseInt(env.IMAP_PORT, 10) || 993,
    secure: env.IMAP_SECURE !== 'false',
    auth: { user: env.IMAP_USER as string, pass: env.IMAP_PASS as string },
    logger: false,
  });
  idleClient = client;
  // imapflow auto-enters IDLE while the mailbox is open; 'exists' fires on new mail.
  client.on('exists', () => {
    void pollOnce().catch(() => {});
  });
  client.on('error', () => {
    /* handled by 'close' → reconnect */
  });
  client.on('close', () => {
    if (idleClient === client) idleClient = null;
    scheduleIdleReconnect();
  });
  try {
    await client.connect();
    await client.mailboxOpen(mailbox);
    logger.info('Email IMAP IDLE connected (replies mailbox)');
  } catch (e) {
    logger.warn(`Email IMAP IDLE failed, falling back to polling: ${(e as Error).message}`);
    if (idleClient === client) idleClient = null;
    scheduleIdleReconnect();
  }
}

function scheduleIdleReconnect(): void {
  if (!running || idleReconnectTimer || idleClient) return;
  idleReconnectTimer = setTimeout(() => {
    idleReconnectTimer = null;
    void startIdle();
  }, 30_000);
}

async function pollOnce(): Promise<void> {
  const mailboxes = Array.from(
    new Set([env.EMAIL_BOUNCE_MAILBOX || 'INBOX', env.EMAIL_REPLIES_MAILBOX || 'INBOX'])
  );

  const client = new ImapFlow({
    host: env.IMAP_HOST as string,
    port: parseInt(env.IMAP_PORT, 10) || 993,
    secure: env.IMAP_SECURE !== 'false',
    auth: { user: env.IMAP_USER as string, pass: env.IMAP_PASS as string },
    logger: false,
  });

  await client.connect();
  try {
    for (const mailbox of mailboxes) {
      const lock = await client.getMailboxLock(mailbox).catch(() => null);
      if (!lock) continue;
      try {
        const uids = (await client.search({ seen: false }, { uid: true })) || [];
        if (!uids.length) continue;
        const slice = uids.slice(0, MAX_PER_MAILBOX);
        for await (const msg of client.fetch(slice, { uid: true, source: true }, { uid: true })) {
          try {
            const raw = msg.source?.toString('utf8') ?? '';
            const parsed = await simpleParser(msg.source as Buffer);
            const email = toInboundEmail(parsed, raw, mailbox, msg.uid);
            if (email.messageId) await ingestInbound(email);
            await client
              .messageFlagsAdd(String(msg.uid), ['\\Seen'], { uid: true })
              .catch(() => {});
          } catch (e) {
            logger.warn(
              `Email IMAP message ${msg.uid} parse/ingest failed: ${(e as Error).message}`
            );
          }
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function addressList(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  const out: string[] = [];
  for (const obj of arr) {
    for (const v of obj.value ?? []) if (v.address) out.push(v.address);
  }
  return out;
}

function toInboundEmail(
  parsed: ParsedMail,
  raw: string,
  mailbox: string,
  uid: number
): InboundEmail {
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];
  const contentType = parsed.headers.get('content-type') as
    | { params?: Record<string, string> }
    | undefined;
  const autoSub = parsed.headers.get('auto-submitted');
  const attachments = (parsed.attachments ?? [])
    .filter((a) => a.content)
    .map((a) => ({
      filename: a.filename || 'attachment',
      contentType: a.contentType || 'application/octet-stream',
      size: typeof a.size === 'number' ? a.size : (a.content as Buffer).length,
      content: a.content as Buffer,
    }));
  return {
    // Deterministic fallback so a message lacking a Message-ID header (some DSNs)
    // is still stored + deduped instead of silently dropped.
    messageId:
      parsed.messageId || `<ha-inbound.${mailbox}.${uid}@${env.IMAP_HOST || 'mail.local'}>`,
    from: parsed.from?.text ?? '',
    to: addressList(parsed.to),
    subject: parsed.subject ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references,
    text: parsed.text ?? null,
    html: typeof parsed.html === 'string' ? parsed.html : null,
    raw,
    autoSubmitted: !!autoSub && String(autoSub).toLowerCase() !== 'no',
    reportType: contentType?.params?.['report-type'] ?? null,
    mailbox,
    imapUid: uid,
    attachments,
  };
}
