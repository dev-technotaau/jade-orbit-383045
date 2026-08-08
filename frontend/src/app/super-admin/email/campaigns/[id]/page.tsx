'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Play,
  Pause,
  X,
  RefreshCw,
  Copy,
  FlaskConical,
  Save,
  Download,
  Pencil,
  ChevronDown,
  ChevronUp,
  Repeat,
  Users,
  Trash2,
} from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Tooltip from '@/components/ui/Tooltip';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { API } from '@/constants/api';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/use-socket';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog, promptDialog } from '@/components/ui/dialog-service';
import {
  EMAIL_CAMPAIGN_STATUS_STYLE,
  EMAIL_RECIPIENT_STATUS_STYLE,
} from '@/components/super-admin/email/email-status-style';
import { VariantBuilder, StepsBuilder } from '@/components/super-admin/email/CampaignBuilders';
import AttachmentPicker from '@/components/super-admin/email/AttachmentPicker';
import type { OutboundAttachmentRef } from '@/types/email';

/** ISO string → value for <input type="datetime-local"> (local time, minute precision). */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
      {label}
      {children}
    </label>
  );
}

const EDIT_INPUT_CLS =
  'rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)]';

/** Label:value row for the read-only Configuration card. Renders nothing for empty values. */
function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-44 shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[var(--text)]">{value}</span>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--bg-secondary)]">
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-24 shrink-0 text-right text-xs font-medium text-[var(--text)]">
        {value.toLocaleString()} ({pct}%)
      </span>
    </div>
  );
}

export default function SuperAdminEmailCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { socket } = useSocket();
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientLimit, setRecipientLimit] = useState(25);

  const { data: aData } = useQuery({
    queryKey: ['email-campaign-analytics', id],
    queryFn: () => svc.campaignAnalytics(id),
    refetchInterval: 15_000,
  });
  const { data: rData } = useQuery({
    queryKey: ['email-campaign-recipients', id, recipientPage, recipientLimit],
    queryFn: () => svc.getRecipients(id, { page: recipientPage, limit: recipientLimit }),
  });
  const { data: cData } = useQuery({
    queryKey: ['email-campaign-full', id],
    queryFn: () => svc.getCampaign(id),
  });
  const { data: tplData } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => svc.listTemplates(),
  });
  const { data: senderData } = useQuery({
    queryKey: ['email-senders'],
    queryFn: () => svc.listSenders(),
  });
  const full = cData?.data;
  const templates = tplData?.data ?? [];
  const senders = senderData?.data ?? [];
  const editable = !!full && ['DRAFT', 'SCHEDULED', 'PAUSED'].includes(full.status);

  // ── Edit-campaign panel ──
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editAttachments, setEditAttachments] = useState<OutboundAttachmentRef[]>([]);

  // Preview resolved audience for DRAFT campaigns (pre-launch count).
  const isDraft = full?.status === 'DRAFT';
  const { data: audienceData } = useQuery({
    queryKey: ['email-campaign-audience', id],
    queryFn: () => svc.previewAudience(id),
    enabled: isDraft,
  });
  const audienceCount = audienceData?.data?.count;

  // Hydrate the edit form from server state whenever the campaign loads/changes.
  useEffect(() => {
    if (!full) return;
    setForm({
      name: full.name ?? '',
      description: full.description ?? '',
      subjectOverride: full.subjectOverride ?? '',
      templateId: full.templateId ?? '',
      senderId: full.senderId ?? '',
      scheduledAt: toDatetimeLocal(full.scheduledAt),
      sendTimezone: full.sendTimezone ?? '',
      recurrenceDays: full.recurrenceDays == null ? '' : String(full.recurrenceDays),
      batchSize: full.batchSize == null ? '' : String(full.batchSize),
      sendRate: full.sendRate == null ? '' : String(full.sendRate),
      fromNameOverride: full.fromNameOverride ?? '',
      replyToOverride: full.replyToOverride ?? '',
      utmSource: full.utmSource ?? '',
      utmMedium: full.utmMedium ?? '',
      utmCampaign: full.utmCampaign ?? '',
      utmTerm: full.utmTerm ?? '',
      utmContent: full.utmContent ?? '',
      variableMapping: full.variableMapping ? JSON.stringify(full.variableMapping, null, 2) : '',
    });
    setEditAttachments(Array.isArray(full.attachments) ? full.attachments : []);
  }, [full]);

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveEdit() {
    // Parse variable mapping up front so an invalid JSON never hits the API.
    let variableMapping: Record<string, unknown> | null = null;
    if (form.variableMapping?.trim()) {
      try {
        variableMapping = JSON.parse(form.variableMapping) as Record<string, unknown>;
      } catch {
        showToast.error('Variable mapping is not valid JSON');
        return;
      }
    }
    setSavingEdit(true);
    try {
      const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
      const tz = form.sendTimezone.trim();
      await svc.updateCampaign(id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        subjectOverride: form.subjectOverride.trim() || null,
        templateId: form.templateId || null,
        senderId: form.senderId || undefined,
        attachments: editAttachments,
        // Empty datetime clears the schedule → backend reverts to DRAFT.
        // With a sendTimezone the backend interprets the RAW wall-clock string
        // in that zone, so we must NOT convert it to UTC here.
        scheduledAt: form.scheduledAt
          ? tz
            ? form.scheduledAt
            : new Date(form.scheduledAt).toISOString()
          : null,
        sendTimezone: tz || null,
        variableMapping,
        recurrenceDays: num(form.recurrenceDays) ?? null,
        batchSize: num(form.batchSize),
        sendRate: num(form.sendRate),
        fromNameOverride: form.fromNameOverride.trim() || null,
        replyToOverride: form.replyToOverride.trim() || null,
        utmSource: form.utmSource.trim() || null,
        utmMedium: form.utmMedium.trim() || null,
        utmCampaign: form.utmCampaign.trim() || null,
        utmTerm: form.utmTerm.trim() || null,
        utmContent: form.utmContent.trim() || null,
      });
      showToast.success('Campaign updated');
      qc.invalidateQueries({ queryKey: ['email-campaign-full', id] });
      qc.invalidateQueries({ queryKey: ['email-campaign-analytics', id] });
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      showToast.error(err.response?.data?.error?.message || 'Update failed');
    } finally {
      setSavingEdit(false);
    }
  }

  useEffect(() => {
    if (!socket) return;
    const handler = () => qc.invalidateQueries({ queryKey: ['email-campaign-analytics', id] });
    socket.on('email:campaign', handler);
    return () => {
      socket.off('email:campaign', handler);
    };
  }, [socket, qc, id]);

  const analytics = aData?.data;
  const c = analytics?.campaign;
  const recipients = rData?.data?.items ?? [];
  const recipientTotal = rData?.data?.total ?? 0;
  const recipientTotalPages = rData?.data?.totalPages ?? Math.ceil(recipientTotal / recipientLimit);

  async function act(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      showToast.success(msg);
      qc.invalidateQueries({ queryKey: ['email-campaign-analytics', id] });
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      showToast.error(err.response?.data?.error?.message || 'Action failed');
    }
  }

  async function exportRecipients() {
    const res = await api.get(API.SUPER_ADMIN.EMAIL_CAMPAIGN_RECIPIENTS_EXPORT(id), {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${id}-recipients.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!c) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="email.campaigns.view"
      >
        <p className="p-8 text-center text-sm text-[var(--text-muted)]">Loading…</p>
      </DashboardLayout>
    );
  }

  const canLaunch = ['DRAFT', 'SCHEDULED', 'PAUSED'].includes(c.status);
  const total = c.totalRecipients || 1;

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.campaigns.view"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
              <Send className="h-6 w-6 text-blue-600" /> {c.name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  EMAIL_CAMPAIGN_STATUS_STYLE[c.status],
                )}
              >
                {c.status}
              </span>
              <Badge variant={c.type === 'SEQUENCE' ? 'accent' : 'info'} size="sm">
                {c.type}
              </Badge>
              {c.autoPausedReason && (
                <Badge variant="error" size="sm">
                  auto-paused: {c.autoPausedReason}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canLaunch && (
              <Button
                size="sm"
                leftIcon={<Play className="h-4 w-4" />}
                onClick={() => act(() => svc.launchCampaign(id), 'Campaign launched')}
              >
                {c.status === 'PAUSED' ? 'Resume' : 'Launch'}
              </Button>
            )}
            {c.status === 'RUNNING' && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Pause className="h-4 w-4" />}
                onClick={() => act(() => svc.pauseCampaign(id), 'Paused')}
              >
                Pause
              </Button>
            )}
            {['RUNNING', 'SCHEDULED', 'PAUSED'].includes(c.status) && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<X className="h-4 w-4" />}
                onClick={() => act(() => svc.cancelCampaign(id), 'Cancelled')}
              >
                Cancel
              </Button>
            )}
            {c.failedCount > 0 && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={() => act(() => svc.retryFailed(id), 'Retrying failed')}
              >
                Retry failed
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<FlaskConical className="h-4 w-4" />}
              onClick={async () => {
                const to = await promptDialog({
                  title: 'Send test email',
                  label: 'Send a test to?',
                });
                if (to) act(() => svc.testSendCampaign(id, to), `Test sent to ${to}`);
              }}
            >
              Test
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Copy className="h-4 w-4" />}
              onClick={() => act(() => svc.duplicateCampaign(id), 'Duplicated')}
            >
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Save className="h-4 w-4" />}
              onClick={async () => {
                const name = await promptDialog({
                  title: 'Save as blueprint',
                  label: 'Blueprint name',
                  defaultValue: c.name,
                });
                if (name) act(() => svc.saveAsBlueprint(id, name), 'Saved as blueprint');
              }}
            >
              Save blueprint
            </Button>
            {['DRAFT', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(c.status) && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Trash2 className="h-4 w-4 text-red-500" />}
                onClick={async () => {
                  if (
                    !(await confirmDialog({
                      title: 'Delete campaign',
                      message: 'Permanently delete this campaign and its recipient list?',
                      confirmLabel: 'Delete',
                      variant: 'danger',
                    }))
                  )
                    return;
                  try {
                    await svc.deleteCampaign(id);
                    showToast.success('Campaign deleted');
                    router.push(ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGNS);
                  } catch (e) {
                    const err = e as { response?: { data?: { error?: { message?: string } } } };
                    showToast.error(err.response?.data?.error?.message || 'Delete failed');
                  }
                }}
              >
                Delete
              </Button>
            )}
            {full?.recurrenceDays != null && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Repeat className="h-4 w-4" />}
                onClick={() => act(() => svc.stopRecurrence(id), 'Recurrence stopped')}
              >
                Stop recurrence
              </Button>
            )}
          </div>
        </div>

        {/* Edit campaign (draft/scheduled/paused) */}
        {editable && (
          <div className="rounded-xl border border-[var(--border)] bg-white">
            <button
              type="button"
              onClick={() => setEditOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--text)]"
            >
              <span className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-600" /> Edit campaign
              </span>
              {editOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {editOpen && (
              <div className="border-t border-[var(--border)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Name"
                    value={form.name ?? ''}
                    onChange={(e) => setField('name', e.target.value)}
                  />
                  <Input
                    label="Subject override"
                    value={form.subjectOverride ?? ''}
                    onChange={(e) => setField('subjectOverride', e.target.value)}
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="Description"
                      value={form.description ?? ''}
                      onChange={(e) => setField('description', e.target.value)}
                    />
                  </div>
                  <EditRow label="Template">
                    <Select
                      placeholder="— None —"
                      options={templates.map((t) => ({ value: t.id, label: t.name }))}
                      value={form.templateId ?? ''}
                      onChange={(v) => setField('templateId', v)}
                    />
                  </EditRow>
                  <EditRow label="Sender">
                    <Select
                      placeholder="Select sender"
                      options={senders.map((s) => ({
                        value: s.id,
                        label: `${s.fromName} <${s.fromEmail}>`,
                      }))}
                      value={form.senderId ?? ''}
                      onChange={(v) => setField('senderId', v)}
                    />
                  </EditRow>
                  <EditRow label="Attachments">
                    <AttachmentPicker
                      value={editAttachments}
                      onChange={setEditAttachments}
                      disabled={savingEdit}
                    />
                  </EditRow>
                  <EditRow label="Scheduled at (empty = revert to DRAFT)">
                    <DatePicker
                      mode="datetime"
                      value={form.scheduledAt ?? ''}
                      onChange={(v) => setField('scheduledAt', v)}
                    />
                  </EditRow>
                  <Input
                    label="Send timezone (IANA, e.g. Asia/Kolkata)"
                    value={form.sendTimezone ?? ''}
                    onChange={(e) => setField('sendTimezone', e.target.value)}
                  />
                  <div>
                    <Input
                      label="Recurrence days"
                      type="number"
                      value={form.recurrenceDays ?? ''}
                      onChange={(e) => setField('recurrenceDays', e.target.value)}
                    />
                    <div className="mt-1 flex gap-1.5">
                      {(
                        [
                          ['Weekly', 7],
                          ['Biweekly', 14],
                          ['Monthly', 30],
                        ] as const
                      ).map(([label, days]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setField('recurrenceDays', String(days))}
                          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                        >
                          {label} ({days})
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    label="Batch size"
                    type="number"
                    value={form.batchSize ?? ''}
                    onChange={(e) => setField('batchSize', e.target.value)}
                  />
                  <Input
                    label="Send rate (emails/sec)"
                    type="number"
                    value={form.sendRate ?? ''}
                    onChange={(e) => setField('sendRate', e.target.value)}
                  />
                  <Input
                    label="From-name override"
                    value={form.fromNameOverride ?? ''}
                    onChange={(e) => setField('fromNameOverride', e.target.value)}
                  />
                  <Input
                    label="Reply-to override"
                    value={form.replyToOverride ?? ''}
                    onChange={(e) => setField('replyToOverride', e.target.value)}
                  />
                </div>

                <div className="mt-3">
                  <EditRow label="Variable mapping (JSON, optional)">
                    <textarea
                      rows={4}
                      value={form.variableMapping ?? ''}
                      onChange={(e) => setField('variableMapping', e.target.value)}
                      placeholder='{"first_name": "contact.name"}'
                      className={cn(EDIT_INPUT_CLS, 'font-mono')}
                    />
                  </EditRow>
                </div>

                <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                  UTM parameters
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Input
                    label="utm_source"
                    value={form.utmSource ?? ''}
                    onChange={(e) => setField('utmSource', e.target.value)}
                  />
                  <Input
                    label="utm_medium"
                    value={form.utmMedium ?? ''}
                    onChange={(e) => setField('utmMedium', e.target.value)}
                  />
                  <Input
                    label="utm_campaign"
                    value={form.utmCampaign ?? ''}
                    onChange={(e) => setField('utmCampaign', e.target.value)}
                  />
                  <Input
                    label="utm_term"
                    value={form.utmTerm ?? ''}
                    onChange={(e) => setField('utmTerm', e.target.value)}
                  />
                  <Input
                    label="utm_content"
                    value={form.utmContent ?? ''}
                    onChange={(e) => setField('utmContent', e.target.value)}
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    size="sm"
                    leftIcon={<Save className="h-4 w-4" />}
                    isLoading={savingEdit}
                    onClick={saveEdit}
                  >
                    Save changes
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Configuration (read-only, all statuses) */}
        {full && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Configuration</h2>
            <div className="space-y-1.5">
              <ConfigRow label="From-name override" value={full.fromNameOverride} />
              <ConfigRow label="Reply-to override" value={full.replyToOverride} />
              <ConfigRow label="Send timezone" value={full.sendTimezone} />
              <ConfigRow
                label="Scheduled at"
                value={full.scheduledAt ? new Date(full.scheduledAt).toLocaleString() : null}
              />
              <ConfigRow
                label="Recurrence"
                value={full.recurrenceDays != null ? `every ${full.recurrenceDays} days` : null}
              />
              <ConfigRow label="Batch size" value={full.batchSize} />
              <ConfigRow label="Send rate" value={`${full.sendRate} emails/sec`} />
              <ConfigRow label="utm_source" value={full.utmSource} />
              <ConfigRow label="utm_medium" value={full.utmMedium} />
              <ConfigRow label="utm_campaign" value={full.utmCampaign} />
              <ConfigRow label="utm_term" value={full.utmTerm} />
              <ConfigRow label="utm_content" value={full.utmContent} />
            </div>
          </div>
        )}

        {/* Funnel */}
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Funnel</h2>
          <div className="space-y-2">
            <FunnelRow label="Sent" value={c.sentCount} total={total} color="#3b82f6" />
            <FunnelRow label="Delivered" value={c.deliveredCount} total={total} color="#0ea5e9" />
            <FunnelRow label="Opened" value={c.openedCount} total={total} color="#6366f1" />
            <FunnelRow label="Clicked" value={c.clickedCount} total={total} color="#10b981" />
            <FunnelRow label="Replied" value={c.repliedCount} total={total} color="#8b5cf6" />
            <FunnelRow label="Bounced" value={c.bouncedCount} total={total} color="#ef4444" />
            <FunnelRow
              label="Unsubscribed"
              value={c.unsubscribedCount}
              total={total}
              color="#f59e0b"
            />
          </div>
          {analytics && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
              <span>
                Open rate: <strong className="text-[var(--text)]">{analytics.rates.open}%</strong>
              </span>
              <span>
                Click rate: <strong className="text-[var(--text)]">{analytics.rates.click}%</strong>
              </span>
              <span>
                CTOR: <strong className="text-[var(--text)]">{analytics.rates.clickToOpen}%</strong>
              </span>
              <span>
                Bounce: <strong className="text-[var(--text)]">{analytics.rates.bounce}%</strong>
              </span>
              <span>
                Complaint:{' '}
                <strong className="text-[var(--text)]">{analytics.rates.complaint}%</strong>
              </span>
              {analytics.bounceSplit && (
                <span>
                  Bounces:{' '}
                  <strong className="text-[var(--text)]">
                    hard {analytics.bounceSplit.hard} / soft {analytics.bounceSplit.soft}
                  </strong>
                </span>
              )}
            </div>
          )}
          {analytics && Object.keys(analytics.byStatus).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(analytics.byStatus)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <span
                    key={status}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                  >
                    {status.toLowerCase()}:{' '}
                    <strong className="text-[var(--text)]">{count.toLocaleString()}</strong>
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* Configure A/B variants (draft/scheduled/paused) */}
        {editable && full?.isAbTest && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
              Configure A/B variants
            </h2>
            <VariantBuilder
              campaignId={id}
              initial={full.variants ?? []}
              templates={templates}
              onSaved={() => qc.invalidateQueries({ queryKey: ['email-campaign-full', id] })}
            />
          </div>
        )}

        {/* Configure drip sequence (draft/scheduled/paused) */}
        {editable && full?.type === 'SEQUENCE' && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
              Configure drip sequence
            </h2>
            <StepsBuilder
              campaignId={id}
              initial={full.steps ?? []}
              templates={templates}
              onSaved={() => qc.invalidateQueries({ queryKey: ['email-campaign-full', id] })}
            />
          </div>
        )}

        {/* A/B variants (performance) */}
        {analytics && analytics.variants.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">A/B variants</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {analytics.variants.map((v) => (
                <div key={v.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                  <p className="font-medium text-[var(--text)]">{v.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {v.sent} sent · open {v.openRate}% · click {v.clickRate}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tracked links */}
        {analytics && analytics.links.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Tracked links</h2>
            <div className="space-y-1.5">
              {analytics.links.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                    {l.url}
                  </span>
                  <Badge variant="info" size="sm">
                    {l.clicks}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recipients */}
        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">Recipients</h2>
              {isDraft && audienceCount != null && (
                <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  <Users className="h-3.5 w-3.5" /> ≈ {audienceCount.toLocaleString()} recipients
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Users className="h-3.5 w-3.5" />}
                onClick={() =>
                  act(async () => {
                    await svc.materialize(id);
                    qc.invalidateQueries({ queryKey: ['email-campaign-recipients', id] });
                  }, 'Recipients rebuilt')
                }
              >
                Rebuild recipients
              </Button>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() =>
                  act(async () => {
                    await svc.reconcile(id);
                    qc.invalidateQueries({ queryKey: ['email-campaign-full', id] });
                  }, 'Stats reconciled')
                }
              >
                Reconcile stats
              </Button>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={exportRecipients}
              >
                Export CSV
              </Button>
            </div>
          </div>
          {recipients.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-[var(--text)]">{r.email}</span>
              {r.isSeed && (
                <Tooltip content="excluded from campaign metrics">
                  <Badge variant="neutral" size="sm">
                    SEED
                  </Badge>
                </Tooltip>
              )}
              {r.openCount > 0 && (
                <span className="text-xs text-[var(--text-muted)]">{r.openCount}× open</span>
              )}
              {r.clickCount > 0 && (
                <span className="text-xs text-[var(--text-muted)]">{r.clickCount}× click</span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_RECIPIENT_STATUS_STYLE[r.status]}`}
              >
                {r.status}
              </span>
            </div>
          ))}
          {recipients.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">
              No recipients materialized yet.
            </p>
          )}
          <div className="p-3">
            <Pagination
              currentPage={recipientPage}
              totalPages={recipientTotalPages}
              onPageChange={setRecipientPage}
              totalItems={recipientTotal}
              pageSize={recipientLimit}
              onPageSizeChange={(s) => {
                setRecipientLimit(s);
                setRecipientPage(1);
              }}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
