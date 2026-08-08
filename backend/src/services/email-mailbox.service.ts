import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import type { ImapFlow, ListResponse, FetchMessageObject, MessageStructureObject } from 'imapflow';
import type { EmailAccount } from '@prisma/client';
import { AppError } from '../middleware/error';
import { withImap } from './email-imap-pool';
import { resolveImapCreds, resolveSmtpCreds } from './email-account.service';
import { downloadFileFromR2, putBufferToR2 } from './storage.service';
import logger from '../config/logger';

/**
 * The one-on-one webmail engine (Roundcube/Gmail-style): live IMAP for reading
 * and folder operations, SMTP for sending, with the sent copy appended back to
 * the IMAP Sent folder so every client stays consistent.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MailAddress {
  name: string;
  address: string;
}

export interface FolderInfo {
  path: string;
  name: string;
  delimiter: string;
  specialUse: string | null;
  role: string | null; // normalized: inbox/sent/drafts/trash/junk/archive
  subscribed: boolean;
  total: number;
  unseen: number;
}

export interface MessageSummary {
  uid: number;
  seq: number;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  date: string | null;
  flags: string[];
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  hasAttachments: boolean;
  size: number;
}

export interface MessageListResult {
  folder: string;
  items: MessageSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface AttachmentMeta {
  index: number;
  filename: string;
  mime: string;
  size: number;
  inline: boolean;
  cid: string | null;
}

export interface MessageDetail {
  uid: number;
  folder: string;
  messageId: string | null;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[];
  date: string | null;
  html: string | null;
  text: string | null;
  flags: string[];
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  inReplyTo: string | null;
  references: string[];
  attachments: AttachmentMeta[];
}

export interface OutboundAttachment {
  key: string; // R2 staging key from the upload endpoint
  filename: string;
  mime?: string;
}

export interface ComposePayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: OutboundAttachment[];
  /** When sending a resumed draft, its uid so the source draft is removed. */
  replaceUid?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RawAddr = { name?: string; address?: string };

function mapAddrs(list?: RawAddr[] | null): MailAddress[] {
  return (list ?? [])
    .filter((a) => a && (a.address || a.name))
    .map((a) => ({ name: a.name || '', address: a.address || '' }));
}

function firstAddr(list?: RawAddr[] | null): MailAddress | null {
  const mapped = mapAddrs(list);
  return mapped[0] ?? null;
}

function flagsToArray(flags?: Set<string> | string[] | null): string[] {
  if (!flags) return [];
  return Array.isArray(flags) ? flags : [...flags];
}

function toIso(d?: string | Date | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function structureHasAttachment(node?: MessageStructureObject): boolean {
  if (!node) return false;
  const children = node.childNodes;
  if (children && children.length) return children.some(structureHasAttachment);
  const disp = (node.disposition || '').toLowerCase();
  if (disp === 'attachment') return true;
  // Some mailers attach files with a filename/name param but no disposition —
  // mirror mailparser (which surfaces them) so the list paperclip matches the
  // opened message. Guard the content-type so inline/body parts aren't flagged.
  const type = (node.type || '').toLowerCase();
  const named =
    (node as { dispositionParameters?: { filename?: string } }).dispositionParameters?.filename ||
    (node as { parameters?: { name?: string } }).parameters?.name;
  if (named && !type.startsWith('multipart/') && type !== 'text/plain' && type !== 'text/html') {
    return true;
  }
  return false;
}

const SPECIAL_NAMES: Record<string, string[]> = {
  sent: ['sent', 'sent items', 'sent mail', 'sent messages'],
  drafts: ['drafts', 'draft'],
  trash: ['trash', 'deleted', 'deleted items', 'deleted messages', 'bin'],
  junk: ['junk', 'spam', 'junk email', 'bulk mail'],
  archive: ['archive', 'archives', 'all mail'],
};

const SPECIAL_USE_ROLE: Record<string, string> = {
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'junk',
  '\\Archive': 'archive',
  '\\All': 'archive',
};

function folderRole(f: ListResponse): string | null {
  if (f.specialUse && SPECIAL_USE_ROLE[f.specialUse]) return SPECIAL_USE_ROLE[f.specialUse];
  const lower = f.name.toLowerCase();
  if (lower === 'inbox') return 'inbox';
  for (const [role, names] of Object.entries(SPECIAL_NAMES)) {
    if (names.includes(lower)) return role;
  }
  return null;
}

async function resolveSpecialFolders(
  client: ImapFlow
): Promise<Record<string, string | undefined>> {
  const list = await client.list();
  const out: Record<string, string | undefined> = {};
  for (const role of ['sent', 'drafts', 'trash', 'junk', 'archive']) {
    const byUse = list.find((f) => folderRole(f) === role && f.name.toLowerCase() !== 'inbox');
    out[role] = byUse?.path;
  }
  return out;
}

/**
 * Neutralize hostile HTML before it reaches the reading pane. The frontend
 * additionally renders inside a `sandbox` iframe, so this is defense-in-depth:
 * strip scripts, event handlers, and javascript: URIs.
 */
function sanitizeMailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');
}

interface ParsedAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
  content?: Buffer;
  contentDisposition?: string;
  cid?: string;
  related?: boolean;
}

/** Replace `cid:` references with inline data URIs so images render without extra fetches. */
function inlineCidImages(html: string, attachments: ParsedAttachment[]): string {
  let out = html;
  for (const att of attachments) {
    if (!att.cid || !att.content) continue;
    if (att.content.length > 5 * 1024 * 1024) continue; // don't bloat the payload
    const dataUri = `data:${att.contentType || 'application/octet-stream'};base64,${att.content.toString('base64')}`;
    const cidEsc = att.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(["'])cid:${cidEsc}\\1`, 'gi'), `$1${dataUri}$1`);
    out = out.replace(new RegExp(`cid:${cidEsc}`, 'gi'), dataUri);
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function listFolders(account: EmailAccount): Promise<FolderInfo[]> {
  const creds = resolveImapCreds(account);
  return withImap(creds, async (client) => {
    const list = await client.list();
    const folders = await Promise.all(
      list
        .filter((f) => !f.flags.has('\\Noselect'))
        .map(async (f): Promise<FolderInfo> => {
          let total = 0;
          let unseen = 0;
          try {
            const st = await client.status(f.path, { messages: true, unseen: true });
            total = st.messages ?? 0;
            unseen = st.unseen ?? 0;
          } catch {
            /* status unsupported on this folder */
          }
          return {
            path: f.path,
            name: f.name,
            delimiter: f.delimiter || '/',
            specialUse: f.specialUse ?? null,
            role: folderRole(f),
            subscribed: f.subscribed ?? true,
            total,
            unseen,
          };
        })
    );
    // Inbox first, then special folders, then the rest alphabetically.
    const roleOrder = ['inbox', 'sent', 'drafts', 'archive', 'junk', 'trash'];
    return folders.sort((a, b) => {
      const ai = a.role ? roleOrder.indexOf(a.role) : -1;
      const bi = b.role ? roleOrder.indexOf(b.role) : -1;
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.path.localeCompare(b.path);
    });
  });
}

export async function createFolder(account: EmailAccount, path: string): Promise<void> {
  const creds = resolveImapCreds(account);
  await withImap(creds, (client) => client.mailboxCreate(path));
}

export async function renameFolder(
  account: EmailAccount,
  path: string,
  newPath: string
): Promise<void> {
  const creds = resolveImapCreds(account);
  await withImap(creds, (client) => client.mailboxRename(path, newPath));
}

export async function deleteFolder(account: EmailAccount, path: string): Promise<void> {
  const creds = resolveImapCreds(account);
  await withImap(creds, (client) => client.mailboxDelete(path));
}

// ---------------------------------------------------------------------------
// Message list
// ---------------------------------------------------------------------------

function mapSummary(m: FetchMessageObject): MessageSummary {
  const flags = flagsToArray(m.flags);
  const flagSet = new Set(flags);
  return {
    uid: m.uid,
    seq: m.seq,
    subject: m.envelope?.subject || '(no subject)',
    from: firstAddr(m.envelope?.from),
    to: mapAddrs(m.envelope?.to),
    date: toIso(m.envelope?.date || m.internalDate),
    flags,
    seen: flagSet.has('\\Seen'),
    flagged: flagSet.has('\\Flagged'),
    answered: flagSet.has('\\Answered'),
    draft: flagSet.has('\\Draft'),
    hasAttachments: structureHasAttachment(m.bodyStructure),
    size: m.size ?? 0,
  };
}

export async function listMessages(
  account: EmailAccount,
  folder: string,
  opts: {
    page?: number;
    limit?: number;
    search?: string;
    unseenOnly?: boolean;
    flaggedOnly?: boolean;
  } = {}
): Promise<MessageListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const creds = resolveImapCreds(account);

  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const mailbox = client.mailbox;
      const exists = mailbox && typeof mailbox === 'object' ? mailbox.exists : 0;

      const query = (opts.search || '').trim();
      const useSearch = Boolean(query) || opts.unseenOnly || opts.flaggedOnly;

      const fetchQuery = {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        internalDate: true,
        size: true,
      } as const;
      const items: MessageSummary[] = [];

      if (useSearch) {
        const criteria: Record<string, unknown> = {};
        if (query) {
          criteria.or = [{ subject: query }, { from: query }, { to: query }, { body: query }];
        }
        if (opts.unseenOnly) criteria.seen = false;
        if (opts.flaggedOnly) criteria.flagged = true;
        const uids = (await client.search(criteria, { uid: true })) || [];
        uids.sort((a, b) => b - a); // newest (highest uid) first
        const total = uids.length;
        const pageUids = uids.slice((page - 1) * limit, page * limit);
        if (pageUids.length) {
          for await (const m of client.fetch(pageUids, fetchQuery, { uid: true })) {
            items.push(mapSummary(m));
          }
          items.sort((a, b) => b.uid - a.uid);
        }
        return { folder, items, total, page, limit };
      }

      if (!exists) return { folder, items, total: 0, page, limit };

      // Newest-first paging over sequence numbers (highest seq = newest).
      const end = exists - (page - 1) * limit;
      if (end < 1) return { folder, items, total: exists, page, limit };
      const start = Math.max(1, end - limit + 1);
      for await (const m of client.fetch(`${start}:${end}`, fetchQuery)) {
        items.push(mapSummary(m));
      }
      items.sort((a, b) => b.seq - a.seq);
      return { folder, items, total: exists, page, limit };
    } finally {
      lock.release();
    }
  });
}

// ---------------------------------------------------------------------------
// Message read
// ---------------------------------------------------------------------------

/** Parse a raw RFC822 buffer into the reading-pane detail shape. */
async function buildDetailFromSource(
  source: Buffer,
  folder: string,
  uid: number,
  flags: string[]
): Promise<MessageDetail> {
  const parsed = await simpleParser(source);
  const attachments = (parsed.attachments || []) as ParsedAttachment[];

  let html: string | null = null;
  if (parsed.html) {
    html = sanitizeMailHtml(inlineCidImages(parsed.html, attachments));
  } else if (parsed.textAsHtml) {
    html = sanitizeMailHtml(parsed.textAsHtml);
  }

  const flagSet = new Set(flags);
  const refs = parsed.references
    ? Array.isArray(parsed.references)
      ? parsed.references
      : [parsed.references]
    : [];

  return {
    uid,
    folder,
    messageId: parsed.messageId ?? null,
    subject: parsed.subject || '(no subject)',
    from: firstAddr(parsed.from?.value as RawAddr[] | undefined),
    to: mapAddrs(
      (parsed.to && !Array.isArray(parsed.to) ? parsed.to.value : undefined) as
        | RawAddr[]
        | undefined
    ),
    cc: mapAddrs(
      (parsed.cc && !Array.isArray(parsed.cc) ? parsed.cc.value : undefined) as
        | RawAddr[]
        | undefined
    ),
    bcc: mapAddrs(
      (parsed.bcc && !Array.isArray(parsed.bcc) ? parsed.bcc.value : undefined) as
        | RawAddr[]
        | undefined
    ),
    replyTo: mapAddrs(
      (parsed.replyTo && !Array.isArray(parsed.replyTo) ? parsed.replyTo.value : undefined) as
        | RawAddr[]
        | undefined
    ),
    date: parsed.date ? new Date(parsed.date).toISOString() : null,
    html,
    text: parsed.text ?? null,
    flags,
    seen: flagSet.has('\\Seen'),
    flagged: flagSet.has('\\Flagged'),
    answered: flagSet.has('\\Answered'),
    inReplyTo: parsed.inReplyTo ?? null,
    references: refs,
    attachments: attachments.map((a, index) => ({
      index,
      filename: a.filename || `attachment-${index + 1}`,
      mime: a.contentType || 'application/octet-stream',
      size: a.size || a.content?.length || 0,
      inline: a.contentDisposition === 'inline' || Boolean(a.related),
      cid: a.cid ?? null,
    })),
  };
}

export async function getMessage(
  account: EmailAccount,
  folder: string,
  uid: number,
  markSeen = true
): Promise<MessageDetail> {
  const creds = resolveImapCreds(account);
  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(
        String(uid),
        { uid: true, source: true, flags: true },
        { uid: true }
      );
      if (!msg || !msg.source)
        throw new AppError('Message not found', 404, 'EMAIL_MESSAGE_NOT_FOUND');
      const flags = flagsToArray(msg.flags);
      if (markSeen && !flags.includes('\\Seen')) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        flags.push('\\Seen');
      }
      return buildDetailFromSource(msg.source, folder, uid, flags);
    } finally {
      lock.release();
    }
  });
}

/** Fetch every message in a conversation in one round-trip (marks them read). */
export async function getThreadMessages(
  account: EmailAccount,
  folder: string,
  uids: number[],
  markSeen = true
): Promise<MessageDetail[]> {
  if (!uids.length) return [];
  const creds = resolveImapCreds(account);
  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const details: MessageDetail[] = [];
      const toMark: string[] = [];
      for (const uid of uids) {
        const msg = await client.fetchOne(
          String(uid),
          { uid: true, source: true, flags: true },
          { uid: true }
        );
        if (!msg || !msg.source) continue;
        const flags = flagsToArray(msg.flags);
        if (markSeen && !flags.includes('\\Seen')) {
          toMark.push(String(uid));
          flags.push('\\Seen');
        }
        details.push(await buildDetailFromSource(msg.source, folder, uid, flags));
      }
      if (toMark.length)
        await client.messageFlagsAdd(toMark.join(','), ['\\Seen'], { uid: true }).catch(() => {});
      details.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return details;
    } finally {
      lock.release();
    }
  });
}

export interface DownloadedAttachment {
  filename: string;
  mime: string;
  content: Buffer;
}

export async function getAttachment(
  account: EmailAccount,
  folder: string,
  uid: number,
  index: number
): Promise<DownloadedAttachment> {
  const creds = resolveImapCreds(account);
  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source)
        throw new AppError('Message not found', 404, 'EMAIL_MESSAGE_NOT_FOUND');
      const parsed = await simpleParser(msg.source);
      const att = (parsed.attachments || [])[index] as ParsedAttachment | undefined;
      if (!att || !att.content)
        throw new AppError('Attachment not found', 404, 'EMAIL_ATTACHMENT_NOT_FOUND');
      return {
        filename: att.filename || `attachment-${index + 1}`,
        mime: att.contentType || 'application/octet-stream',
        content: att.content,
      };
    } finally {
      lock.release();
    }
  });
}

/** Raw RFC822 source for "view original" / .eml export. */
export async function getRawMessage(
  account: EmailAccount,
  folder: string,
  uid: number
): Promise<Buffer> {
  const creds = resolveImapCreds(account);
  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source)
        throw new AppError('Message not found', 404, 'EMAIL_MESSAGE_NOT_FOUND');
      return msg.source;
    } finally {
      lock.release();
    }
  });
}

// ---------------------------------------------------------------------------
// Flags / move / delete
// ---------------------------------------------------------------------------

const uidRange = (uids: number[]): string => uids.join(',');

export async function setFlags(
  account: EmailAccount,
  folder: string,
  uids: number[],
  add: string[] = [],
  remove: string[] = []
): Promise<void> {
  if (!uids.length) return;
  const creds = resolveImapCreds(account);
  await withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const range = uidRange(uids);
      if (add.length) await client.messageFlagsAdd(range, add, { uid: true });
      if (remove.length) await client.messageFlagsRemove(range, remove, { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function moveMessages(
  account: EmailAccount,
  folder: string,
  uids: number[],
  target: string
): Promise<void> {
  if (!uids.length) return;
  const creds = resolveImapCreds(account);
  await withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove(uidRange(uids), target, { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function copyMessages(
  account: EmailAccount,
  folder: string,
  uids: number[],
  target: string
): Promise<void> {
  if (!uids.length) return;
  const creds = resolveImapCreds(account);
  await withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageCopy(uidRange(uids), target, { uid: true });
    } finally {
      lock.release();
    }
  });
}

/**
 * Delete = move to Trash. If the message is already in Trash (or no Trash
 * folder exists), expunge it permanently.
 */
export async function deleteMessages(
  account: EmailAccount,
  folder: string,
  uids: number[],
  permanent = false
): Promise<{ trashed: boolean }> {
  if (!uids.length) return { trashed: false };
  const creds = resolveImapCreds(account);
  return withImap(creds, async (client) => {
    const special = await resolveSpecialFolders(client);
    const inTrash = special.trash && folder === special.trash;
    const lock = await client.getMailboxLock(folder);
    try {
      const range = uidRange(uids);
      if (permanent || inTrash || !special.trash) {
        await client.messageDelete(range, { uid: true });
        return { trashed: false };
      }
      await client.messageMove(range, special.trash, { uid: true });
      return { trashed: true };
    } finally {
      lock.release();
    }
  });
}

// ---------------------------------------------------------------------------
// Compose helpers
// ---------------------------------------------------------------------------

async function resolveOutboundAttachments(
  attachments?: OutboundAttachment[]
): Promise<{ filename: string; content: Buffer; contentType?: string }[]> {
  if (!attachments?.length) return [];
  const out: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const a of attachments) {
    try {
      const content = await downloadFileFromR2(a.key);
      out.push({ filename: a.filename, content, contentType: a.mime });
    } catch (err) {
      logger.warn(`Failed to load outbound attachment ${a.key}: ${(err as Error).message}`);
      throw new AppError(
        `Attachment "${a.filename}" could not be loaded`,
        400,
        'EMAIL_ATTACHMENT_LOAD_FAILED'
      );
    }
  }
  return out;
}

interface BuiltMessage {
  raw: Buffer;
  envelope: nodemailer.SentMessageInfo['envelope'];
  messageId: string;
}

/** Compile a full MIME message to bytes without sending (stream transport). */
async function buildMime(
  account: EmailAccount,
  payload: ComposePayload,
  extraFlags: { draft?: boolean } = {}
): Promise<BuiltMessage> {
  const smtp = resolveSmtpCreds(account);
  const attachments = await resolveOutboundAttachments(payload.attachments);
  const html = payload.html ?? undefined;
  const text = payload.text ?? (html ? htmlToText(html) : undefined);

  const headers: Record<string, string> = {};
  if (payload.inReplyTo) headers['In-Reply-To'] = payload.inReplyTo;
  if (payload.references?.length) headers.References = payload.references.join(' ');

  const compiler = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });
  const built = await compiler.sendMail({
    from: { name: smtp.fromName, address: smtp.fromEmail },
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    html,
    text,
    inReplyTo: payload.inReplyTo || undefined,
    references: payload.references?.length ? payload.references : undefined,
    headers,
    attachments,
  });
  void extraFlags;
  // built.messageId is the Message-ID nodemailer embedded into `built.message`.
  // Re-sending those exact bytes as `raw` elsewhere would otherwise fabricate a
  // fresh id, so surface the real one here for the caller to return.
  return { raw: built.message as Buffer, envelope: built.envelope, messageId: built.messageId };
}

// ---------------------------------------------------------------------------
// Send / draft
// ---------------------------------------------------------------------------

export interface SendResult {
  messageId: string;
  appendedToSent: boolean;
}

export async function sendMessage(
  account: EmailAccount,
  payload: ComposePayload
): Promise<SendResult> {
  if (!payload.to.length && !payload.cc?.length && !payload.bcc?.length) {
    throw new AppError('At least one recipient is required', 400, 'EMAIL_NO_RECIPIENTS');
  }
  const smtp = resolveSmtpCreds(account);
  const { raw, envelope, messageId } = await buildMime(account, payload);

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 30_000,
  });

  try {
    await transport.sendMail({ envelope, raw });
  } finally {
    transport.close();
  }

  // Append a copy to the Sent folder (so it shows in every client) and, when a
  // resumed draft was just sent, remove the source draft.
  let appendedToSent = false;
  try {
    const creds = resolveImapCreds(account);
    await withImap(creds, async (client) => {
      const special = await resolveSpecialFolders(client);
      if (special.sent) {
        await client.append(special.sent, raw, ['\\Seen']);
        appendedToSent = true;
      }
      if (payload.replaceUid && special.drafts) {
        const lock = await client.getMailboxLock(special.drafts);
        try {
          await client.messageDelete(String(payload.replaceUid), { uid: true }).catch(() => {});
        } finally {
          lock.release();
        }
      }
    });
  } catch (err) {
    logger.warn(`Sent-folder append failed for ${account.email}: ${(err as Error).message}`);
  }

  return { messageId, appendedToSent };
}

export interface SaveDraftResult {
  uid: number | null;
  folder: string;
}

/**
 * Append a draft to the Drafts folder. When `replaceUid` is given, the previous
 * draft is deleted so editing a draft doesn't pile up copies.
 */
export async function saveDraft(
  account: EmailAccount,
  payload: ComposePayload,
  replaceUid?: number
): Promise<SaveDraftResult> {
  const { raw } = await buildMime(account, payload, { draft: true });
  const creds = resolveImapCreds(account);
  return withImap(creds, async (client) => {
    const special = await resolveSpecialFolders(client);
    const draftsFolder = special.drafts;
    if (!draftsFolder)
      throw new AppError('No Drafts folder available', 400, 'EMAIL_NO_DRAFTS_FOLDER');

    if (replaceUid) {
      const lock = await client.getMailboxLock(draftsFolder);
      try {
        await client.messageDelete(String(replaceUid), { uid: true }).catch(() => {});
      } finally {
        lock.release();
      }
    }

    const appended = await client.append(draftsFolder, raw, ['\\Draft', '\\Seen']);
    const uid =
      appended && typeof appended === 'object' && 'uid' in appended
        ? (appended.uid as number)
        : null;
    return { uid, folder: draftsFolder };
  });
}

export interface MailboxOverview {
  sent?: string;
  drafts?: string;
  trash?: string;
  junk?: string;
  archive?: string;
}

export async function getSpecialFolders(account: EmailAccount): Promise<MailboxOverview> {
  const creds = resolveImapCreds(account);
  return withImap(creds, (client) => resolveSpecialFolders(client));
}

// ---------------------------------------------------------------------------
// Forward — re-stage the original's attachments to R2 for re-sending
// ---------------------------------------------------------------------------

export interface StagedAttachment {
  key: string;
  filename: string;
  mime: string;
  size: number;
}

/**
 * Download the non-inline attachments of a message and stage them to R2 so a
 * forward can carry them, returning the keys the composer references on send.
 */
export async function stageForwardAttachments(
  account: EmailAccount,
  folder: string,
  uid: number
): Promise<StagedAttachment[]> {
  const creds = resolveImapCreds(account);
  const parsed = await withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      if (!msg || !msg.source)
        throw new AppError('Message not found', 404, 'EMAIL_MESSAGE_NOT_FOUND');
      return simpleParser(msg.source);
    } finally {
      lock.release();
    }
  });

  const out: StagedAttachment[] = [];
  for (const a of (parsed.attachments || []) as ParsedAttachment[]) {
    if (!a.content) continue;
    // Inline (cid) parts are re-rendered from the quoted body — do not duplicate.
    if (a.contentDisposition === 'inline' || a.related) continue;
    const filename = a.filename || 'attachment';
    const safe = filename.replace(/[^\w.\-() ]/g, '_').slice(0, 200) || 'attachment';
    const key = `email-outbound/${crypto.randomUUID()}/${safe}`;
    const mime = a.contentType || 'application/octet-stream';
    await putBufferToR2(a.content, key, mime);
    out.push({ key, filename, mime, size: a.content.length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conversation threading (Gmail-style, grouped by References/In-Reply-To)
// ---------------------------------------------------------------------------

export interface ThreadSummary {
  threadId: string;
  subject: string;
  latestFrom: MailAddress | null;
  participants: MailAddress[];
  latestDate: string | null;
  messageCount: number;
  unreadCount: number;
  hasAttachments: boolean;
  flagged: boolean;
  seen: boolean;
  uids: number[];
}

export interface ThreadListResult {
  folder: string;
  items: ThreadSummary[];
  total: number;
  page: number;
  limit: number;
  windowed: boolean; // true when older messages fell outside the threading window
}

// Threading the whole mailbox on every request is too expensive over IMAP, so
// we group the most-recent window of messages.
const THREAD_WINDOW = 400;

function parseMessageIds(text: string): string[] {
  const ids = text.match(/<[^>\s]+>/g);
  return ids ? [...new Set(ids)] : [];
}

interface ThreadRow {
  uid: number;
  token: string;
  links: string[];
  subject: string;
  from: MailAddress | null;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAtt: boolean;
}

export async function listThreads(
  account: EmailAccount,
  folder: string,
  opts: {
    page?: number;
    limit?: number;
    search?: string;
    unseenOnly?: boolean;
    flaggedOnly?: boolean;
  } = {}
): Promise<ThreadListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const creds = resolveImapCreds(account);

  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const mailbox = client.mailbox;
      const exists = mailbox && typeof mailbox === 'object' ? mailbox.exists : 0;

      const query = (opts.search || '').trim();
      const useSearch = Boolean(query) || opts.unseenOnly || opts.flaggedOnly;
      const fetchQuery = {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        internalDate: true,
        headers: ['references', 'in-reply-to'] as string[],
      };

      const rows: ThreadRow[] = [];
      let windowed = false;

      const collect = (m: FetchMessageObject) => {
        const flags = new Set(flagsToArray(m.flags));
        const env = m.envelope;
        const headerText = m.headers ? m.headers.toString() : '';
        const links = parseMessageIds(headerText);
        if (env?.inReplyTo) links.push(...parseMessageIds(env.inReplyTo));
        const token = env?.messageId || `uid:${m.uid}`;
        rows.push({
          uid: m.uid,
          token,
          links,
          subject: env?.subject || '(no subject)',
          from: firstAddr(env?.from),
          date: toIso(env?.date || m.internalDate),
          seen: flags.has('\\Seen'),
          flagged: flags.has('\\Flagged'),
          hasAtt: structureHasAttachment(m.bodyStructure),
        });
      };

      if (useSearch) {
        const criteria: Record<string, unknown> = {};
        if (query)
          criteria.or = [{ subject: query }, { from: query }, { to: query }, { body: query }];
        if (opts.unseenOnly) criteria.seen = false;
        if (opts.flaggedOnly) criteria.flagged = true;
        const uids = ((await client.search(criteria, { uid: true })) || []).sort((a, b) => a - b);
        if (!uids.length) return { folder, items: [], total: 0, page, limit, windowed: false };
        windowed = uids.length > THREAD_WINDOW;
        const capped = uids.slice(-THREAD_WINDOW);
        for await (const m of client.fetch(capped, fetchQuery, { uid: true })) collect(m);
      } else {
        if (!exists) return { folder, items: [], total: 0, page, limit, windowed: false };
        windowed = exists > THREAD_WINDOW;
        const start = Math.max(1, exists - THREAD_WINDOW + 1);
        for await (const m of client.fetch(`${start}:${exists}`, fetchQuery)) collect(m);
      }

      // Union-find over message-id tokens so anything sharing a reference groups.
      const parent = new Map<string, string>();
      const ensure = (id: string) => {
        if (!parent.has(id)) parent.set(id, id);
      };
      const find = (id: string): string => {
        let root = id;
        while (parent.get(root) !== root) root = parent.get(root) as string;
        let cur = id;
        while (parent.get(cur) !== root) {
          const next = parent.get(cur) as string;
          parent.set(cur, root);
          cur = next;
        }
        return root;
      };
      const union = (a: string, b: string) => {
        ensure(a);
        ensure(b);
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      };

      for (const r of rows) {
        ensure(r.token);
        for (const link of r.links) union(r.token, link);
      }

      // Group rows by connected component.
      const groups = new Map<string, ThreadRow[]>();
      for (const r of rows) {
        const root = find(r.token);
        const arr = groups.get(root);
        if (arr) arr.push(r);
        else groups.set(root, [r]);
      }

      const threads: ThreadSummary[] = [];
      for (const group of groups.values()) {
        group.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const latest = group[group.length - 1];
        const rootSubject =
          group.find((g) => g.subject && g.subject !== '(no subject)')?.subject || latest.subject;
        const participants = new Map<string, MailAddress>();
        for (const g of group) {
          if (g.from && g.from.address && !participants.has(g.from.address.toLowerCase())) {
            participants.set(g.from.address.toLowerCase(), g.from);
          }
        }
        const uids = group.map((g) => g.uid).sort((a, b) => a - b);
        threads.push({
          threadId: `t${Math.min(...uids)}`,
          subject: rootSubject,
          latestFrom: latest.from,
          participants: [...participants.values()].slice(0, 6),
          latestDate: latest.date,
          messageCount: group.length,
          unreadCount: group.filter((g) => !g.seen).length,
          hasAttachments: group.some((g) => g.hasAtt),
          flagged: group.some((g) => g.flagged),
          seen: group.every((g) => g.seen),
          uids,
        });
      }

      threads.sort((a, b) => (b.latestDate || '').localeCompare(a.latestDate || ''));
      const total = threads.length;
      const items = threads.slice((page - 1) * limit, page * limit);
      return { folder, items, total, page, limit, windowed };
    } finally {
      lock.release();
    }
  });
}

// ---------------------------------------------------------------------------
// Recipient autocomplete — harvested from recent Inbox/Sent correspondents
// ---------------------------------------------------------------------------

export interface RecipientSuggestion {
  name: string;
  address: string;
}

const suggestCache = new Map<string, { at: number; entries: RecipientSuggestion[] }>();
const SUGGEST_TTL = 10 * 60 * 1000;
const SUGGEST_HARVEST = 300;

async function harvestAddresses(account: EmailAccount): Promise<RecipientSuggestion[]> {
  const cached = suggestCache.get(account.id);
  if (cached && Date.now() - cached.at < SUGGEST_TTL) return cached.entries;

  const creds = resolveImapCreds(account);
  const map = new Map<string, RecipientSuggestion>();
  const selfEmail = account.email.toLowerCase();

  await withImap(creds, async (client) => {
    const special = await resolveSpecialFolders(client);
    const targets: { path: string; sent: boolean }[] = [{ path: 'INBOX', sent: false }];
    if (special.sent) targets.push({ path: special.sent, sent: true });

    for (const t of targets) {
      try {
        const lock = await client.getMailboxLock(t.path);
        try {
          const mailbox = client.mailbox;
          const exists = mailbox && typeof mailbox === 'object' ? mailbox.exists : 0;
          if (!exists) continue;
          const start = Math.max(1, exists - SUGGEST_HARVEST + 1);
          for await (const m of client.fetch(`${start}:${exists}`, { uid: true, envelope: true })) {
            const env = m.envelope;
            const pick = t.sent ? [...(env?.to ?? []), ...(env?.cc ?? [])] : (env?.from ?? []);
            for (const a of pick) {
              const address = (a.address || '').toLowerCase();
              if (!address || !address.includes('@') || address === selfEmail) continue;
              if (!map.has(address))
                map.set(address, { name: a.name || '', address: a.address || address });
            }
          }
        } finally {
          lock.release();
        }
      } catch {
        /* folder unavailable — skip */
      }
    }
  });

  const entries = [...map.values()].sort((a, b) =>
    (a.name || a.address).localeCompare(b.name || b.address)
  );
  suggestCache.set(account.id, { at: Date.now(), entries });
  return entries;
}

export async function suggestRecipients(
  account: EmailAccount,
  q: string,
  limit = 8
): Promise<RecipientSuggestion[]> {
  const entries = await harvestAddresses(account);
  const query = q.trim().toLowerCase();
  const filtered = query
    ? entries.filter(
        (e) => e.address.toLowerCase().includes(query) || e.name.toLowerCase().includes(query)
      )
    : entries;
  return filtered.slice(0, limit);
}
