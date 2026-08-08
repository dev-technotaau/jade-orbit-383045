import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import * as accounts from '../services/email-account.service';
import * as mailbox from '../services/email-mailbox.service';
import { putBufferToR2 } from '../services/storage.service';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): H =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };

const num = (v: unknown, d: number): number => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const uid = (req: Request): string => req.user!.id;
const accId = (req: Request): string => String(req.params.id);
const loadAccount = (req: Request) => accounts.getAccountRow(uid(req), accId(req));

function toUidArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const n = Number(v);
  return Number.isFinite(n) ? [n] : [];
}

// ── Accounts ─────────────────────────────────────────────────────────────────
export const listAccounts = wrap(async (req, res) =>
  ok(res, await accounts.listAccounts(uid(req)))
);
export const getAccount = wrap(async (req, res) =>
  ok(res, await accounts.getAccount(uid(req), accId(req)))
);
export const createAccount = wrap(async (req, res) =>
  ok(res, await accounts.createAccount(uid(req), req.body), 201)
);
export const updateAccount = wrap(async (req, res) =>
  ok(res, await accounts.updateAccount(uid(req), accId(req), req.body))
);
export const deleteAccount = wrap(async (req, res) => {
  await accounts.deleteAccount(uid(req), accId(req));
  ok(res, { deleted: true });
});
export const testAccount = wrap(async (req, res) =>
  ok(
    res,
    await accounts.testConnectivity(uid(req), { ...req.body, id: req.params.id || req.body.id })
  )
);

// ── Folders ──────────────────────────────────────────────────────────────────
export const listFolders = wrap(async (req, res) =>
  ok(res, await mailbox.listFolders(await loadAccount(req)))
);
export const createFolder = wrap(async (req, res) => {
  await mailbox.createFolder(await loadAccount(req), String(req.body.path));
  ok(res, { created: true }, 201);
});
export const renameFolder = wrap(async (req, res) => {
  await mailbox.renameFolder(
    await loadAccount(req),
    String(req.body.path),
    String(req.body.newPath)
  );
  ok(res, { renamed: true });
});
export const deleteFolder = wrap(async (req, res) => {
  await mailbox.deleteFolder(await loadAccount(req), String(req.body.path));
  ok(res, { deleted: true });
});
export const specialFolders = wrap(async (req, res) =>
  ok(res, await mailbox.getSpecialFolders(await loadAccount(req)))
);

// ── Messages ─────────────────────────────────────────────────────────────────
export const listMessages = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const result = await mailbox.listMessages(account, String(req.query.folder || 'INBOX'), {
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 50),
    search: req.query.search ? String(req.query.search) : undefined,
    unseenOnly: req.query.unseenOnly === 'true',
    flaggedOnly: req.query.flaggedOnly === 'true',
  });
  ok(res, result);
});

export const getMessage = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const detail = await mailbox.getMessage(
    account,
    String(req.query.folder || 'INBOX'),
    num(req.query.uid, 0),
    req.query.peek !== 'true'
  );
  ok(res, detail);
});

export const getAttachment = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const att = await mailbox.getAttachment(
    account,
    String(req.query.folder || 'INBOX'),
    num(req.query.uid, 0),
    num(req.query.index, 0)
  );
  const inline = req.query.inline === 'true';
  // RFC 6266: an ASCII fallback (control chars stripped) plus a UTF-8 filename*
  // so non-ASCII names (CJK, accents) download correctly instead of throwing.
  const rawName = att.filename || 'attachment';
  const asciiName = rawName.replace(/[\r\n"]/g, '').replace(/[^\x20-\x7e]/g, '_') || 'attachment';
  res.setHeader('Content-Type', att.mime);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
  );
  res.send(att.content);
});

export const listThreads = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const result = await mailbox.listThreads(account, String(req.query.folder || 'INBOX'), {
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 50),
    search: req.query.search ? String(req.query.search) : undefined,
    unseenOnly: req.query.unseenOnly === 'true',
    flaggedOnly: req.query.flaggedOnly === 'true',
  });
  ok(res, result);
});

export const getThread = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const uids = String(req.query.uids || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  const details = await mailbox.getThreadMessages(
    account,
    String(req.query.folder || 'INBOX'),
    uids,
    req.query.peek !== 'true'
  );
  ok(res, details);
});

export const suggestRecipients = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const suggestions = await mailbox.suggestRecipients(
    account,
    String(req.query.q || ''),
    num(req.query.limit, 8)
  );
  ok(res, suggestions);
});

export const forwardAttachments = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const staged = await mailbox.stageForwardAttachments(
    account,
    String(req.body.folder || 'INBOX'),
    Number(req.body.uid) || 0
  );
  ok(res, staged);
});

export const getRawMessage = wrap(async (req, res) => {
  const account = await loadAccount(req);
  const raw = await mailbox.getRawMessage(
    account,
    String(req.query.folder || 'INBOX'),
    num(req.query.uid, 0)
  );
  res.setHeader('Content-Type', 'message/rfc822');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="message-${num(req.query.uid, 0)}.eml"`
  );
  res.send(raw);
});

// ── Flags / move / delete ────────────────────────────────────────────────────
export const setFlags = wrap(async (req, res) => {
  await mailbox.setFlags(
    await loadAccount(req),
    String(req.body.folder),
    toUidArray(req.body.uids),
    req.body.add || [],
    req.body.remove || []
  );
  ok(res, { ok: true });
});

export const moveMessages = wrap(async (req, res) => {
  await mailbox.moveMessages(
    await loadAccount(req),
    String(req.body.folder),
    toUidArray(req.body.uids),
    String(req.body.target)
  );
  ok(res, { moved: true });
});

export const copyMessages = wrap(async (req, res) => {
  await mailbox.copyMessages(
    await loadAccount(req),
    String(req.body.folder),
    toUidArray(req.body.uids),
    String(req.body.target)
  );
  ok(res, { copied: true });
});

export const deleteMessages = wrap(async (req, res) =>
  ok(
    res,
    await mailbox.deleteMessages(
      await loadAccount(req),
      String(req.body.folder),
      toUidArray(req.body.uids),
      Boolean(req.body.permanent)
    )
  )
);

// ── Compose ──────────────────────────────────────────────────────────────────
function composeFromBody(body: Record<string, unknown>): mailbox.ComposePayload {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : v ? [String(v)] : [];
  return {
    to: arr(body.to),
    cc: arr(body.cc),
    bcc: arr(body.bcc),
    subject: String(body.subject || ''),
    html: body.html ? String(body.html) : undefined,
    text: body.text ? String(body.text) : undefined,
    inReplyTo: body.inReplyTo ? String(body.inReplyTo) : null,
    references: arr(body.references),
    attachments: Array.isArray(body.attachments)
      ? (body.attachments as { key: string; filename: string; mime?: string }[])
      : [],
    replaceUid: body.replaceUid ? Number(body.replaceUid) : undefined,
  };
}

export const sendMessage = wrap(async (req, res) =>
  ok(res, await mailbox.sendMessage(await loadAccount(req), composeFromBody(req.body)))
);

export const saveDraft = wrap(async (req, res) =>
  ok(
    res,
    await mailbox.saveDraft(
      await loadAccount(req),
      composeFromBody(req.body),
      req.body.replaceUid ? Number(req.body.replaceUid) : undefined
    )
  )
);

// ── Outbound attachment staging (upload → R2 → key referenced on send) ─────────
export const uploadAttachment = wrap(async (req, res) => {
  const file = (
    req as unknown as { file?: { buffer: Buffer; originalname: string; mimetype: string } }
  ).file;
  if (!file) {
    res
      .status(400)
      .json({ success: false, error: { message: 'No file uploaded', code: 'EMAIL_NO_FILE' } });
    return;
  }
  const safeName = file.originalname.replace(/[^\w.\-() ]/g, '_').slice(0, 200) || 'attachment';
  const key = `email-outbound/${crypto.randomUUID()}/${safeName}`;
  await putBufferToR2(file.buffer, key, file.mimetype || 'application/octet-stream');
  ok(
    res,
    {
      key,
      filename: file.originalname,
      mime: file.mimetype || 'application/octet-stream',
      size: file.buffer.length,
    },
    201
  );
});
