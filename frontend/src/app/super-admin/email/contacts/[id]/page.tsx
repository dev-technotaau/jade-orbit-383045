'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  User,
  ArrowLeft,
  Save,
  Download,
  Ban,
  Trash2,
  Activity,
  Mail,
  MousePointerClick,
  Eye,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { ROUTES } from '@/constants/routes';
import type { EmailSubscribeStatus } from '@/types/email';

const SUBSCRIBE_STATUSES: EmailSubscribeStatus[] = [
  'SUBSCRIBED',
  'UNSUBSCRIBED',
  'PENDING',
  'CLEANED',
  'UNKNOWN',
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  SUBSCRIBED: 'success',
  PENDING: 'warning',
  UNSUBSCRIBED: 'neutral',
  CLEANED: 'error',
  UNKNOWN: 'neutral',
};

const EVENT_VARIANT: Record<
  string,
  'success' | 'warning' | 'error' | 'info' | 'neutral' | 'accent'
> = {
  DELIVERED: 'success',
  OPEN: 'info',
  OPENED: 'info',
  CLICK: 'accent',
  CLICKED: 'accent',
  BOUNCE: 'error',
  BOUNCED: 'error',
  COMPLAINT: 'error',
  UNSUBSCRIBE: 'warning',
  SENT: 'neutral',
};

function fmt(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function SuperAdminEmailContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['email-contact-timeline', id],
    queryFn: () => svc.contactTimeline(id),
    enabled: !!id,
  });

  const contact = data?.data?.contact;
  const events = data?.data?.events ?? [];
  const campaigns = data?.data?.campaigns ?? [];

  const [status, setStatus] = useState<EmailSubscribeStatus>('UNKNOWN');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sync form fields from server state without setting state in effect body synchronously.
  useEffect(() => {
    if (!contact) return;
    queueMicrotask(() => {
      setStatus(contact.subscribeStatus);
      setTagsInput((contact.tags ?? []).join(', '));
    });
  }, [contact]);

  async function saveContact() {
    if (!id) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await svc.updateContact(id, { subscribeStatus: status, tags });
      showToast.success('Contact updated');
      qc.invalidateQueries({ queryKey: ['email-contact-timeline', id] });
    } catch {
      showToast.error('Could not update contact');
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    if (!id) return;
    setExporting(true);
    try {
      const blob = await svc.contactDataExport(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contact-${contact?.email ?? id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast.success('Data export downloaded');
    } catch {
      showToast.error('Could not export data');
    } finally {
      setExporting(false);
    }
  }

  async function toggleBlock() {
    if (!id || !contact) return;
    const next = !contact.isBlocked;
    try {
      await svc.blockContact(id, next);
      showToast.success(next ? 'Contact blocked' : 'Contact unblocked');
      qc.invalidateQueries({ queryKey: ['email-contact-timeline', id] });
    } catch {
      showToast.error('Could not update block status');
    }
  }

  async function erase() {
    if (!id) return;
    if (
      !(await confirmDialog({
        title: 'Erase contact',
        message: 'Erase all personal data for this contact? This cannot be undone.',
        confirmLabel: 'Erase',
        variant: 'danger',
      }))
    )
      return;
    try {
      await svc.eraseContact(id);
      showToast.success('Contact erased (GDPR)');
      qc.invalidateQueries({ queryKey: ['email-contact-timeline', id] });
    } catch {
      showToast.error('Could not erase contact');
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.contacts.view"
    >
      <div className="space-y-4">
        <Link
          href={ROUTES.SUPER_ADMIN.EMAIL_CONTACTS}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to contacts
        </Link>

        {isLoading && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">Loading contact…</p>
        )}

        {!isLoading && !contact && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">Contact not found.</p>
        )}

        {contact && (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                <User className="h-5 w-5 text-[var(--text-muted)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="flex items-center gap-2 truncate text-2xl font-bold text-[var(--text)]">
                  {contact.email}
                  <Badge variant={STATUS_VARIANT[contact.subscribeStatus] ?? 'neutral'} size="sm">
                    {contact.subscribeStatus}
                  </Badge>
                  {contact.isBlocked && (
                    <Badge variant="error" size="sm">
                      Blocked
                    </Badge>
                  )}
                </h1>
                {contact.name && (
                  <p className="truncate text-sm text-[var(--text-muted)]">{contact.name}</p>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                  Bounces
                </p>
                <p className="text-lg font-bold text-[var(--text)]">{contact.bounceCount}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                  Complaints
                </p>
                <p className="text-lg font-bold text-[var(--text)]">{contact.complaintCount}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                  Last opened
                </p>
                <p className="text-sm font-semibold text-[var(--text)]">
                  {fmt(contact.lastOpenedAt)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                  Last clicked
                </p>
                <p className="text-sm font-semibold text-[var(--text)]">
                  {fmt(contact.lastClickedAt)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                  Last emailed
                </p>
                <p className="text-sm font-semibold text-[var(--text)]">
                  {fmt(contact.lastEmailedAt)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                  Tags
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(contact.tags ?? []).length === 0 && (
                    <span className="text-sm text-[var(--text-muted)]">—</span>
                  )}
                  {(contact.tags ?? []).map((t) => (
                    <Badge key={t} variant="secondary" size="sm">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Consent */}
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <ShieldCheck className="h-4 w-4" /> Consent
              </h2>
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3 text-xs">
                  <span className="shrink-0 font-medium text-[var(--text-muted)]">Source</span>
                  <span className="break-all text-[var(--text)]">
                    {contact.subscribeSource ?? '—'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 text-xs">
                  <span className="shrink-0 font-medium text-[var(--text-muted)]">
                    Subscribed at
                  </span>
                  <span className="break-all text-[var(--text)]">{fmt(contact.subscribedAt)}</span>
                </div>
                {contact.consentEvidence &&
                  Object.entries(contact.consentEvidence).map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between gap-3 text-xs">
                      <span className="shrink-0 font-medium text-[var(--text-muted)]">{key}</span>
                      <span className="break-all text-[var(--text)]">{stringifyValue(value)}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Edit form + GDPR actions */}
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Manage contact</h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                  <Select
                    label="Subscribe status"
                    options={SUBSCRIBE_STATUSES.map((s) => ({ value: s, label: s }))}
                    value={status}
                    onChange={(v) => setStatus(v as EmailSubscribeStatus)}
                    clearable={false}
                  />
                </div>
                <div className="min-w-[16rem] flex-1">
                  <Input
                    label="Tags (comma separated)"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="vip, newsletter"
                  />
                </div>
                <Button
                  leftIcon={<Save className="h-4 w-4" />}
                  onClick={saveContact}
                  isLoading={saving}
                >
                  Save
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download className="h-4 w-4" />}
                  onClick={exportData}
                  isLoading={exporting}
                >
                  Download data (GDPR)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Ban className="h-4 w-4" />}
                  onClick={toggleBlock}
                >
                  {contact.isBlocked ? 'Unblock' : 'Block'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={erase}
                >
                  Erase
                </Button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Activity timeline */}
              <div className="rounded-xl border border-[var(--border)] bg-white">
                <h2 className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">
                  <Activity className="h-4 w-4" /> Activity timeline
                </h2>
                {events.length === 0 && (
                  <p className="p-6 text-center text-sm text-[var(--text-muted)]">No events yet.</p>
                )}
                <ul className="max-h-[28rem] overflow-y-auto" data-lenis-prevent>
                  {events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0"
                    >
                      <Badge variant={EVENT_VARIANT[ev.eventType] ?? 'neutral'} size="sm">
                        {ev.eventType}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--text-muted)]">{fmt(ev.createdAt)}</p>
                        {ev.url && (
                          <p className="truncate text-xs text-[var(--text-secondary)]">{ev.url}</p>
                        )}
                        {ev.reason && (
                          <p className="text-xs text-[var(--text-secondary)]">{ev.reason}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Campaign history */}
              <div className="rounded-xl border border-[var(--border)] bg-white">
                <h2 className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">
                  <Mail className="h-4 w-4" /> Campaign history
                </h2>
                {campaigns.length === 0 && (
                  <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                    No campaigns yet.
                  </p>
                )}
                <ul className="max-h-[28rem] overflow-y-auto" data-lenis-prevent>
                  {campaigns.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">
                          {c.campaign?.name ?? 'Untitled campaign'}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{fmt(c.sentAt)}</p>
                      </div>
                      <Badge variant="neutral" size="sm">
                        {c.status}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Eye className="h-3.5 w-3.5" /> {c.openCount}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <MousePointerClick className="h-3.5 w-3.5" /> {c.clickCount}
                      </span>
                      {c.bouncedAt && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-label="Bounced" />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
