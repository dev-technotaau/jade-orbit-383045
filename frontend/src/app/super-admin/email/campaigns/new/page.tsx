'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Send, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ROUTES } from '@/constants/routes';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import type { EmailCampaignType, OutboundAttachmentRef } from '@/types/email';
import AttachmentPicker from '@/components/super-admin/email/AttachmentPicker';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';

const ROLES = ['CANDIDATE', 'EMPLOYER', 'ADMIN'];

type AudienceType = 'platform' | 'segment' | 'set' | 'manual';

export default function SuperAdminEmailCampaignNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Preselect from the Sets page "Use in campaign" link: ?audienceType=set&setId=…
  const initialAudienceType = searchParams?.get('audienceType') ?? null;
  const initialSetId = searchParams?.get('setId') ?? '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<OutboundAttachmentRef[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [senderId, setSenderId] = useState('');
  const [mode, setMode] = useState<'broadcast' | 'abtest' | 'drip'>('broadcast');
  const [audienceType, setAudienceType] = useState<AudienceType>(
    initialAudienceType === 'set' ? 'set' : 'platform',
  );
  const [roles, setRoles] = useState<string[]>(['CANDIDATE']);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [segmentId, setSegmentId] = useState('');
  const [setId, setSetId] = useState(initialSetId);
  const [emails, setEmails] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrenceDays, setRecurrenceDays] = useState('');
  const [fromNameOverride, setFromNameOverride] = useState('');
  const [replyToOverride, setReplyToOverride] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [sendTimezone, setSendTimezone] = useState('');
  const [batchSize, setBatchSize] = useState('200');
  const [sendRate, setSendRate] = useState('20');
  const [busy, setBusy] = useState(false);

  const { data: templatesData } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => svc.listTemplates({ status: 'ACTIVE' }),
  });
  const { data: sendersData } = useQuery({
    queryKey: ['email-senders'],
    queryFn: () => svc.listSenders(),
  });
  const { data: segmentsData } = useQuery({
    queryKey: ['email-segments'],
    queryFn: () => svc.listSegments(),
  });
  const { data: setsData } = useQuery({ queryKey: ['email-sets'], queryFn: () => svc.listSets() });
  const templates = templatesData?.data ?? [];
  const senders = sendersData?.data ?? [];
  const segments = segmentsData?.data ?? [];
  const sets = setsData?.data ?? [];
  const selectedSet = sets.find((s) => s.id === setId);

  const rolesParam = roles.join(',') || undefined;
  const { data: countData } = useQuery({
    queryKey: ['email-wizard-count', rolesParam, verifiedOnly],
    queryFn: () => svc.countPlatformUsers({ roles: rolesParam, verifiedOnly }),
    enabled: audienceType === 'platform',
  });

  const { data: segmentSizeData } = useQuery({
    queryKey: ['email-wizard-segment-size', segmentId],
    queryFn: () => svc.segmentSize(segmentId),
    enabled: audienceType === 'segment' && !!segmentId,
  });

  function toggleRole(r: string) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  async function create() {
    if (!name || !templateId) {
      showToast.error('Name and template are required');
      return;
    }
    if (audienceType === 'set' && !setId) {
      showToast.error('Select a static set');
      return;
    }
    const audienceFilter =
      audienceType === 'platform'
        ? { roles, verifiedOnly }
        : audienceType === 'manual'
          ? {
              emails: emails
                .split(/[\s,;]+/)
                .map((e) => e.trim())
                .filter(Boolean),
            }
          : audienceType === 'set'
            ? { setId }
            : undefined;
    const type: EmailCampaignType = mode === 'drip' ? 'SEQUENCE' : 'BROADCAST';
    const isAbTest = mode === 'abtest';
    setBusy(true);
    try {
      const res = await svc.createCampaign({
        name,
        description: description || undefined,
        templateId,
        senderId: senderId || undefined,
        attachments: attachments.length ? attachments : undefined,
        type,
        isAbTest,
        audienceType,
        audienceFilter,
        segmentId: audienceType === 'segment' ? segmentId : undefined,
        scheduledAt: scheduledAt
          ? sendTimezone.trim()
            ? scheduledAt
            : new Date(scheduledAt).toISOString()
          : undefined,
        recurrenceDays: recurrenceDays ? Number(recurrenceDays) : undefined,
        fromNameOverride: fromNameOverride.trim() || undefined,
        replyToOverride: replyToOverride.trim() || undefined,
        utmSource: utmSource.trim() || undefined,
        utmMedium: utmMedium.trim() || undefined,
        utmCampaign: utmCampaign.trim() || undefined,
        utmTerm: utmTerm.trim() || undefined,
        utmContent: utmContent.trim() || undefined,
        sendTimezone: sendTimezone.trim() || undefined,
        batchSize: batchSize ? Number(batchSize) : undefined,
        sendRate: sendRate ? Number(sendRate) : undefined,
      });
      showToast.success(
        isAbTest || type === 'SEQUENCE'
          ? 'Draft created — configure variants/steps on the campaign page'
          : 'Campaign created as draft',
      );
      const id = res.data?.id;
      router.push(
        id ? ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGN_DETAIL(id) : ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGNS,
      );
    } catch {
      showToast.error('Could not create campaign');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.campaigns.create"
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
          <Send className="h-6 w-6 text-blue-600" /> New Email Campaign
        </h1>

        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="font-semibold text-[var(--text)]">1 · Basics</h2>
          <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <Select
              label="Template"
              placeholder="Select a template…"
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.name} (${t.category})`,
              }))}
              value={templateId}
              onChange={(v) => setTemplateId(v)}
            />
            {templates.length === 0 && (
              <span className="text-xs text-amber-600">
                No ACTIVE templates — activate one first.
              </span>
            )}
          </div>
          <Select
            label="Sender (optional — defaults to primary)"
            placeholder="Default sender"
            options={senders.map((s) => ({
              value: s.id,
              label: `${s.fromEmail} ${s.dkimVerified ? '✓ DKIM' : '✗ DKIM'}`,
            }))}
            value={senderId}
            onChange={(v) => setSenderId(v)}
          />
          <div>
            <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Attachments (optional)
            </span>
            <AttachmentPicker value={attachments} onChange={setAttachments} disabled={busy} />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Attached to every email in this campaign. Prefer linking to hosted files for large
              sends.
            </p>
          </div>
          <div className="flex gap-2">
            {(
              [
                ['broadcast', 'Broadcast'],
                ['abtest', 'A/B Test'],
                ['drip', 'Drip sequence'],
              ] as Array<['broadcast' | 'abtest' | 'drip', string]>
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode !== 'broadcast' && (
            <p className="rounded-lg bg-[var(--bg-secondary)] p-2 text-xs text-[var(--text-muted)]">
              {mode === 'abtest'
                ? 'You’ll define the A/B variants (template + subject + weight) on the campaign page after creating this draft.'
                : 'You’ll define the drip steps (template + delay + condition) on the campaign page after creating this draft.'}
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="font-semibold text-[var(--text)]">2 · Audience</h2>
          <div className="flex gap-2">
            {(
              [
                ['platform', 'Platform'],
                ['segment', 'Segment'],
                ['set', 'Static set'],
                ['manual', 'Manual'],
              ] as Array<[AudienceType, string]>
            ).map(([a, label]) => (
              <button
                key={a}
                onClick={() => setAudienceType(a)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${audienceType === a ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {audienceType === 'platform' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => toggleRole(r)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${roles.includes(r) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                />
                Verified emails only
              </label>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                ≈ {(countData?.data?.count ?? 0).toLocaleString()} recipients
              </div>
            </div>
          )}
          {audienceType === 'segment' && (
            <div className="space-y-2">
              <Select
                placeholder="Select a segment…"
                options={segments.map((s) => ({ value: s.id, label: s.name }))}
                value={segmentId}
                onChange={(v) => setSegmentId(v)}
              />
              {segmentId && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  ≈ {(segmentSizeData?.data?.count ?? 0).toLocaleString()} recipients
                </div>
              )}
            </div>
          )}
          {audienceType === 'set' && (
            <div className="space-y-2">
              <Select
                placeholder="Select a static set…"
                options={sets.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.memberCount.toLocaleString()})`,
                }))}
                value={setId}
                onChange={(v) => setSetId(v)}
              />
              {sets.length === 0 && (
                <span className="text-xs text-amber-600">
                  No sets yet — create one from the Sets page first.
                </span>
              )}
              {setId && selectedSet && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  ≈ {selectedSet.memberCount.toLocaleString()} recipients
                </div>
              )}
            </div>
          )}
          {audienceType === 'manual' && (
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={5}
              placeholder="Paste emails, one per line or comma-separated"
              className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
            />
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="font-semibold text-[var(--text)]">3 · Schedule</h2>
          <DatePicker
            mode="datetime"
            label="Schedule for (leave blank to launch manually)"
            value={scheduledAt}
            onChange={(v) => setScheduledAt(v)}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Repeat every N days (blank = one-off)"
                type="number"
                value={recurrenceDays}
                onChange={(e) => setRecurrenceDays(e.target.value)}
              />
            </div>
            {(
              [
                ['Weekly', '7'],
                ['Biweekly', '14'],
                ['Monthly', '30'],
              ] as Array<[string, string]>
            ).map(([label, days]) => (
              <button
                key={label}
                type="button"
                onClick={() => setRecurrenceDays(days)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${recurrenceDays === days ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="rounded-lg bg-[var(--bg-secondary)] p-2 text-xs text-[var(--text-muted)]">
            A CAN-SPAM/DPDP footer with a physical address + one-click unsubscribe is added to every
            marketing send automatically. The campaign is created as a <strong>draft</strong> —
            review and launch it from the campaign page.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="font-semibold text-[var(--text)]">4 · Advanced (optional)</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Overrides and delivery tuning — leave blank to use sender defaults.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="From name override"
              value={fromNameOverride}
              onChange={(e) => setFromNameOverride(e.target.value)}
              placeholder="Hire Adda Team"
            />
            <Input
              label="Reply-to override"
              type="email"
              value={replyToOverride}
              onChange={(e) => setReplyToOverride(e.target.value)}
              placeholder="replies@example.com"
            />
          </div>
          <div className="space-y-2 rounded-lg bg-[var(--bg-secondary)] p-3">
            <span className="block text-sm font-medium text-[var(--text)]">UTM parameters</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="utm_source"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="newsletter"
              />
              <Input
                label="utm_medium"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="email"
              />
              <Input
                label="utm_campaign"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                placeholder="spring_launch"
              />
              <Input
                label="utm_term"
                value={utmTerm}
                onChange={(e) => setUtmTerm(e.target.value)}
                placeholder="jobs"
              />
              <Input
                label="utm_content"
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
                placeholder="cta_button"
              />
            </div>
          </div>
          <Input
            label="Send timezone (IANA, e.g. Asia/Kolkata)"
            value={sendTimezone}
            onChange={(e) => setSendTimezone(e.target.value)}
            placeholder="Asia/Kolkata"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Batch size"
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              placeholder="200"
            />
            <Input
              label="Send rate (emails/sec)"
              type="number"
              value={sendRate}
              onChange={(e) => setSendRate(e.target.value)}
              placeholder="20"
            />
          </div>
        </section>

        <div className="flex justify-end">
          <Button leftIcon={<ChevronRight className="h-4 w-4" />} isLoading={busy} onClick={create}>
            Create draft
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
