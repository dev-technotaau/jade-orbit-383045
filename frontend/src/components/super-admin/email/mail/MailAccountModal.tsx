'use client';

import { useState, type ReactNode } from 'react';
import { Check, X, Info, Trash2, User, Inbox, Send, Plug } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Checkbox from '@/components/ui/Checkbox';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { cn } from '@/lib/utils';
import { mailboxService } from '@/services/mailbox.service';
import type { MailAccountInput, MailConnectivityResult } from '@/types/email-mailbox';
import type { MailAccountModalProps } from '@/components/super-admin/email/mail/props';

/** Safely pull a human-readable message out of an unknown error. */
function extractError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const maybe = e as {
      message?: string;
      response?: { data?: { error?: { message?: string } } };
    };
    return maybe.response?.data?.error?.message || maybe.message || fallback;
  }
  return fallback;
}

/** Small uppercase section heading with a leading icon. */
function SectionHeader({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[var(--text-tertiary)]">{icon}</span>
      <h3 className="text-xs font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
        {children}
      </h3>
    </div>
  );
}

/** One IMAP/SMTP row in the inline connectivity result. */
function ResultRow({ label, ok, error }: { label: string; ok: boolean; error?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-[var(--error)]" />
      )}
      <span className="font-medium text-[var(--text)]">{label}</span>
      {ok ? (
        <Badge variant="success" size="sm">
          Connected
        </Badge>
      ) : (
        <span className="text-[var(--error)]">{error || 'Connection failed'}</span>
      )}
    </div>
  );
}

export default function MailAccountModal(props: MailAccountModalProps) {
  const { account, onClose, onSaved, onDeleted } = props;
  const isEditing = account !== null;

  // ── Form state (lazily initialized from the account when editing) ──
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [color, setColor] = useState(account?.color ?? '');
  const [signature, setSignature] = useState(account?.signature ?? '');
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);

  const [imapHost, setImapHost] = useState(account?.imapHost ?? '');
  const [imapPort, setImapPort] = useState(String(account?.imapPort ?? 993));
  const [imapSecure, setImapSecure] = useState(account?.imapSecure ?? true);
  const [imapUser, setImapUser] = useState(account?.imapUser ?? '');
  const [imapPass, setImapPass] = useState('');

  const [smtpHost, setSmtpHost] = useState(account?.smtpHost ?? '');
  const [smtpPort, setSmtpPort] = useState(String(account?.smtpPort ?? 465));
  const [smtpSecure, setSmtpSecure] = useState(account?.smtpSecure ?? true);
  const [smtpUser, setSmtpUser] = useState(account?.smtpUser ?? '');
  const [smtpPass, setSmtpPass] = useState('');

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<MailConnectivityResult | null>(null);

  const busy = testing || saving || deleting;

  /** Build a Partial<MailAccountInput> from the current fields. */
  function buildBody(): Partial<MailAccountInput> {
    const resolvedImapUser = imapUser.trim() || email.trim();
    const resolvedSmtpUser = smtpUser.trim() || email.trim();
    const body: Partial<MailAccountInput> = {
      name: name.trim(),
      email: email.trim(),
      imapHost: imapHost.trim(),
      imapPort: Number(imapPort) || 993,
      imapSecure,
      imapUser: resolvedImapUser,
      smtpHost: smtpHost.trim(),
      smtpPort: Number(smtpPort) || 465,
      smtpSecure,
      smtpUser: resolvedSmtpUser,
      isDefault,
      color: color.trim() ? color.trim() : null,
      signature: signature.trim() ? signature.trim() : null,
    };
    // Only include passwords when the user actually typed one.
    if (imapPass) body.imapPass = imapPass;
    if (smtpPass) body.smtpPass = smtpPass;
    return body;
  }

  /** Returns an error string if the form is invalid, else null. */
  function validate(): string | null {
    if (!name.trim()) return 'Display name is required.';
    if (!email.trim()) return 'Email address is required.';
    if (!imapHost.trim()) return 'IMAP host is required.';
    if (!(imapUser.trim() || email.trim())) return 'IMAP username is required.';
    if (!smtpHost.trim()) return 'SMTP host is required.';
    if (!(smtpUser.trim() || email.trim())) return 'SMTP username is required.';
    if (!isEditing) {
      if (!imapPass) return 'IMAP password is required to connect a new account.';
      if (!smtpPass) return 'SMTP password is required to connect a new account.';
    }
    return null;
  }

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const body = buildBody();
      const res = account
        ? await mailboxService.testAccount(account.id, body)
        : await mailboxService.testNewAccount(body);
      if (res.data) {
        setResult(res.data);
        if (res.data.imap.ok && res.data.smtp.ok) {
          showToast.success('Both IMAP and SMTP connected successfully.');
        } else {
          showToast.error('One or more connections failed. See details below.');
        }
      } else {
        showToast.error('Connection test failed.');
      }
    } catch (e) {
      showToast.error(extractError(e, 'Connection test failed.'));
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      showToast.error(err);
      return;
    }
    setSaving(true);
    try {
      const body = buildBody();
      if (account) {
        await mailboxService.updateAccount(account.id, body);
      } else {
        await mailboxService.createAccount(body as MailAccountInput);
      }
      showToast.success(isEditing ? 'Mail account updated.' : 'Mail account connected.');
      onSaved();
      onClose();
    } catch (e) {
      showToast.error(extractError(e, 'Failed to save the mail account.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!account) return;
    const ok = await confirmDialog({
      title: 'Remove mail account',
      message: `Remove the mail account "${account.email}"? This disconnects it here; messages on the server are not affected.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await mailboxService.deleteAccount(account.id);
      showToast.success('Mail account removed.');
      onDeleted?.();
      onClose();
    } catch (e) {
      showToast.error(extractError(e, 'Failed to delete the mail account.'));
    } finally {
      setDeleting(false);
    }
  }

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {isEditing && (
          <Button
            variant="destructive"
            size="md"
            onClick={handleDelete}
            isLoading={deleting}
            disabled={busy}
            leftIcon={<Trash2 className="h-4 w-4" />}
          >
            Delete
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={handleTest}
          isLoading={testing}
          disabled={busy}
          leftIcon={<Plug className="h-4 w-4" />}
        >
          Test connection
        </Button>
        <Button variant="primary" size="md" onClick={handleSave} isLoading={saving} disabled={busy}>
          {isEditing ? 'Save changes' : 'Connect account'}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEditing ? 'Edit mail account' : 'Connect mail account'}
      size="lg"
      footer={footer}
    >
      <div className="space-y-6">
        {/* Platform tip */}
        <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-secondary)]">
          <Info className="text-primary mt-0.5 h-4 w-4 shrink-0" />
          <p>
            For Hire Adda mailboxes, IMAP is typically{' '}
            <span className="font-medium text-[var(--text)]">mail.hireadda.in:993</span> and SMTP{' '}
            <span className="font-medium text-[var(--text)]">mail.hireadda.in:465</span> (both with
            SSL/TLS). Any standard IMAP/SMTP provider works too.
          </p>
        </div>

        {/* ── Identity ── */}
        <section>
          <SectionHeader icon={<User className="h-4 w-4" />}>Identity</SectionHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Display name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Support Team"
              disabled={busy}
            />
            <Input
              label="Email address"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hireadda.in"
              disabled={busy}
            />
            <Input
              label="Accent color (optional)"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#2563eb"
              helperText="Hex color used to tag this account in the mailbox."
              disabled={busy}
              rightIcon={
                color.trim() ? (
                  <span
                    className="h-4 w-4 rounded-full border border-[var(--border)]"
                    style={{ backgroundColor: color.trim() }}
                    aria-hidden="true"
                  />
                ) : undefined
              }
            />
            <div className="flex items-end">
              <Checkbox
                label="Set as default account"
                description="New messages compose from this account by default."
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="mail-account-signature"
                className="mb-1.5 block text-sm font-medium text-[var(--text)]"
              >
                Signature (optional)
              </label>
              <textarea
                id="mail-account-signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder={'Best regards,\nSupport Team'}
                rows={3}
                disabled={busy}
                className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:outline-none"
              />
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Auto-added to new messages composed from this account.
              </p>
            </div>
          </div>
        </section>

        {/* ── Incoming (IMAP) ── */}
        <section>
          <SectionHeader icon={<Inbox className="h-4 w-4" />}>Incoming (IMAP)</SectionHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="IMAP host"
              required
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
              placeholder="mail.hireadda.in"
              disabled={busy}
            />
            <Input
              label="IMAP port"
              type="number"
              value={imapPort}
              onChange={(e) => setImapPort(e.target.value)}
              placeholder="993"
              disabled={busy}
            />
            <Input
              label="IMAP username"
              value={imapUser}
              onChange={(e) => setImapUser(e.target.value)}
              placeholder="Defaults to the email address"
              helperText="Leave blank to use the email address above."
              disabled={busy}
            />
            <Input
              label="IMAP password"
              type="password"
              value={imapPass}
              onChange={(e) => setImapPass(e.target.value)}
              placeholder={account ? 'Leave blank to keep current' : ''}
              helperText={
                account
                  ? account.hasImapPass
                    ? 'A password is already saved. Leave blank to keep it.'
                    : 'No password saved yet — enter one.'
                  : undefined
              }
              disabled={busy}
            />
            <div className="sm:col-span-2">
              <Checkbox
                label="Use SSL/TLS (recommended)"
                checked={imapSecure}
                onChange={(e) => setImapSecure(e.target.checked)}
                disabled={busy}
              />
            </div>
          </div>
        </section>

        {/* ── Outgoing (SMTP) ── */}
        <section>
          <SectionHeader icon={<Send className="h-4 w-4" />}>Outgoing (SMTP)</SectionHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="SMTP host"
              required
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="mail.hireadda.in"
              disabled={busy}
            />
            <Input
              label="SMTP port"
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="465"
              disabled={busy}
            />
            <Input
              label="SMTP username"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="Defaults to the email address"
              helperText="Leave blank to use the email address above."
              disabled={busy}
            />
            <Input
              label="SMTP password"
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={account ? 'Leave blank to keep current' : ''}
              helperText={
                account
                  ? account.hasSmtpPass
                    ? 'A password is already saved. Leave blank to keep it.'
                    : 'No password saved yet — enter one.'
                  : undefined
              }
              disabled={busy}
            />
            <div className="sm:col-span-2">
              <Checkbox
                label="Use SSL/TLS (recommended)"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                disabled={busy}
              />
            </div>
          </div>
        </section>

        {/* ── Connectivity result ── */}
        {result && (
          <div
            className={cn(
              'space-y-2 rounded-lg border p-3',
              result.imap.ok && result.smtp.ok
                ? 'border-[var(--success)] bg-[var(--success-light)]'
                : 'border-[var(--border)] bg-[var(--bg-secondary)]',
            )}
          >
            <ResultRow label="IMAP (incoming)" ok={result.imap.ok} error={result.imap.error} />
            <ResultRow label="SMTP (outgoing)" ok={result.smtp.ok} error={result.smtp.error} />
          </div>
        )}
      </div>
    </Modal>
  );
}
