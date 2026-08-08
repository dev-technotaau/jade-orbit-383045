/**
 * Types for the one-on-one webmail client (Roundcube/Gmail-style): personal
 * IMAP/SMTP accounts, folders, messages, and the composer. Mirrors the backend
 * email-mailbox + email-account services.
 */

export interface MailAddress {
  name: string;
  address: string;
}

export interface MailAccount {
  id: string;
  userId: string;
  name: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  signature: string | null;
  color: string | null;
  isDefault: boolean;
  lastError: string | null;
  lastSyncAt: string | null;
  hasImapPass: boolean;
  hasSmtpPass: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailAccountInput {
  name: string;
  email: string;
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser: string;
  imapPass?: string;
  smtpHost: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPass?: string;
  signature?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

export type MailFolderRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | null;

export interface MailFolder {
  path: string;
  name: string;
  delimiter: string;
  specialUse: string | null;
  role: MailFolderRole;
  subscribed: boolean;
  total: number;
  unseen: number;
}

export interface MailSummary {
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

export interface MailListResult {
  folder: string;
  items: MailSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface MailAttachmentMeta {
  index: number;
  filename: string;
  mime: string;
  size: number;
  inline: boolean;
  cid: string | null;
}

export interface MailDetail {
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
  attachments: MailAttachmentMeta[];
}

export interface MailOutboundAttachment {
  key: string;
  filename: string;
  mime?: string;
}

export interface MailComposePayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: MailOutboundAttachment[];
  replaceUid?: number;
}

export interface MailSendResult {
  messageId: string;
  appendedToSent: boolean;
}

export interface MailDraftResult {
  uid: number | null;
  folder: string;
}

export interface MailSpecialFolders {
  sent?: string;
  drafts?: string;
  trash?: string;
  junk?: string;
  archive?: string;
}

export interface MailConnectivityResult {
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}

export interface MailUploadResult {
  key: string;
  filename: string;
  mime: string;
  size: number;
}

export interface MailMessageQuery {
  folder: string;
  page?: number;
  limit?: number;
  search?: string;
  unseenOnly?: boolean;
  flaggedOnly?: boolean;
}

export interface MailThread {
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

export interface MailThreadListResult {
  folder: string;
  items: MailThread[];
  total: number;
  page: number;
  limit: number;
  windowed: boolean;
}

export interface RecipientSuggestion {
  name: string;
  address: string;
}

export interface MailStagedAttachment {
  key: string;
  filename: string;
  mime: string;
  size: number;
}
