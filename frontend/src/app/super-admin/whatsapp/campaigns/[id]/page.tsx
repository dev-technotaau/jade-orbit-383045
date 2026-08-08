'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCw,
  RefreshCw,
  X,
  Download,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Target,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import CampaignVariantBuilder, {
  type VariantDraft,
} from '@/components/super-admin/whatsapp/CampaignVariantBuilder';
import CampaignManageActions from '@/components/super-admin/whatsapp/CampaignManageActions';
import CampaignLinksSection from '@/components/super-admin/whatsapp/CampaignLinksSection';
import { CAMPAIGN_STATUS_STYLE } from '@/components/super-admin/whatsapp/campaign-status-style';
import type {
  WaCampaignRecipientStatus,
  WaSequenceStep,
  WaCampaignVariant,
} from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const CONDITION_OPTIONS = [
  { value: 'any', label: 'Always send' },
  { value: 'no_reply', label: 'Only if no reply yet' },
  { value: 'replied', label: 'Only if they replied' },
];

const CONDITION_LABEL: Record<WaSequenceStep['condition'], string> = {
  any: 'Always',
  no_reply: 'If no reply',
  replied: 'If replied',
};

// Funnel stage colors, matched to the recipient-status palette used elsewhere.
// Sent → Delivered → Read → Replied → Converted.
const FUNNEL_COLORS = ['#0ea5e9', '#6366f1', '#22c55e', '#10b981', '#f59e0b'] as const;

const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
} as const;

interface StepDraft {
  templateId: string;
  delayHours: string;
  condition: WaSequenceStep['condition'];
}

const RECIP_STYLE: Record<WaCampaignRecipientStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-indigo-100 text-indigo-700',
  READ: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-3 text-center">
      <p className="text-xl font-bold text-[var(--text)]">{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const qc = useQueryClient();

  const { socket } = useSocket();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['wa-campaign', id],
    queryFn: () => svc.getCampaign(id),
    refetchInterval: 5_000,
  });
  const c = data?.data ?? null;

  // Pre-launch audience preview returns BOTH the eligible recipient count
  // and the estimated cost (paise). Shown for campaigns not yet running.
  const isPreLaunch = c?.status === 'DRAFT' || c?.status === 'SCHEDULED';
  const { data: previewData } = useQuery({
    queryKey: ['wa-campaign-preview', id],
    queryFn: () => svc.previewCampaign(id),
    enabled: isPreLaunch,
  });
  const preview = previewData?.data ?? null;

  const { data: recipData } = useQuery({
    queryKey: ['wa-recipients', id],
    queryFn: () => svc.getRecipients(id, { limit: 50 }),
    refetchInterval: 8_000,
    enabled: !!c && c.status !== 'DRAFT',
  });
  const recipients = recipData?.data?.items ?? [];

  // Live campaign progress: the backend emits `wa:campaign` with the
  // campaign `id` on each counter change. Invalidate the campaign query so
  // the stat grid + progress bar update without waiting for the 5s poll
  // (refetchInterval stays as a fallback if the socket is down).
  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { id?: string }) => {
      if (payload?.id !== id) return;
      qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
    };
    socket.on('wa:campaign', handler);
    return () => {
      socket.off('wa:campaign', handler);
    };
  }, [socket, qc, id]);

  const actionMut = useMutation({
    mutationFn: (action: 'launch' | 'pause' | 'resume' | 'cancel') => {
      if (action === 'launch') return svc.launchCampaign(id);
      if (action === 'pause') return svc.pauseCampaign(id);
      if (action === 'resume') return svc.resumeCampaign(id);
      return svc.cancelCampaign(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Action failed'),
  });

  const retryMut = useMutation({
    mutationFn: () => svc.retryFailedCampaign(id),
    onSuccess: () => {
      showToast.success('Retrying failed recipients');
      qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
      qc.invalidateQueries({ queryKey: ['wa-recipients', id] });
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Retry failed'),
  });

  // ── Conversions (attribution / ROI) ──
  const { data: conversionsData } = useQuery({
    queryKey: ['wa-campaign-conversions', id],
    queryFn: () => svc.getCampaignConversions(id),
  });
  const conversions = conversionsData?.data ?? [];

  const [convValue, setConvValue] = useState('');
  const [convNote, setConvNote] = useState('');

  const conversionMut = useMutation({
    mutationFn: () => {
      const valueRupees = parseFloat(convValue);
      const valuePaise =
        convValue.trim() && Number.isFinite(valueRupees)
          ? Math.round(valueRupees * 100)
          : undefined;
      return svc.recordConversion({
        campaignId: id,
        valuePaise,
        note: convNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      showToast.success('Conversion recorded');
      setConvValue('');
      setConvNote('');
      qc.invalidateQueries({ queryKey: ['wa-campaign-conversions', id] });
      qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to record conversion'),
  });

  // ── Sequence steps ──
  const isSequence = c?.type === 'SEQUENCE';
  const canEditSteps = isSequence && c?.status === 'DRAFT';

  const { data: stepsData } = useQuery({
    queryKey: ['wa-campaign-steps', id],
    queryFn: () => svc.getCampaignSteps(id),
    enabled: isSequence,
  });
  const steps = stepsData?.data ?? [];

  // Approved templates — only needed when the draft steps are editable.
  const { data: stepTplData } = useQuery({
    queryKey: ['wa-templates', 'approved'],
    queryFn: () => svc.listTemplates({ status: 'APPROVED', limit: 100 }),
    enabled: !!canEditSteps,
  });
  const stepTemplates = stepTplData?.data?.items ?? [];
  const stepTplOptions = stepTemplates.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.category})`,
  }));
  const templateName = (tid: string) => stepTemplates.find((t) => t.id === tid)?.name;

  // Local editable copy of the steps, seeded from the server once and on edit-enter.
  const [draftSteps, setDraftSteps] = useState<StepDraft[] | null>(null);
  const beginEditing = () =>
    setDraftSteps(
      (steps.length
        ? steps
        : [{ stepOrder: 1, templateId: '', delayHours: 0, condition: 'any' as const }]
      ).map((s) => ({
        templateId: s.templateId,
        delayHours: String(s.delayHours),
        condition: s.condition,
      })),
    );
  const updateDraft = (index: number, patch: Partial<StepDraft>) =>
    setDraftSteps((prev) =>
      prev ? prev.map((s, i) => (i === index ? { ...s, ...patch } : s)) : prev,
    );
  const addDraft = () =>
    setDraftSteps((prev) =>
      prev ? [...prev, { templateId: '', delayHours: '24', condition: 'any' }] : prev,
    );
  const removeDraft = (index: number) =>
    setDraftSteps((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  const moveDraft = (index: number, dir: -1 | 1) =>
    setDraftSteps((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const stepsMut = useMutation({
    mutationFn: () => {
      const payload: WaSequenceStep[] = (draftSteps ?? []).map((s, i) => ({
        stepOrder: i + 1,
        templateId: s.templateId,
        delayHours: Math.max(0, parseInt(s.delayHours, 10) || 0),
        condition: s.condition,
      }));
      return svc.setCampaignSteps(id, payload);
    },
    onSuccess: () => {
      showToast.success('Sequence steps saved');
      setDraftSteps(null);
      qc.invalidateQueries({ queryKey: ['wa-campaign-steps', id] });
      qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to save steps'),
  });

  const saveSteps = () => {
    if (!draftSteps || draftSteps.length === 0)
      return showToast.error('Add at least one sequence step');
    if (draftSteps.some((s) => !s.templateId))
      return showToast.error('Every step needs an approved template');
    stepsMut.mutate();
  };

  // ── A/B variants ──
  const isAbTest = c?.isAbTest === true;

  const { data: variantsData } = useQuery({
    queryKey: ['wa-campaign-variants', id],
    queryFn: () => svc.getCampaignVariants(id),
    enabled: isAbTest,
  });
  const variants = variantsData?.data ?? [];
  // A campaign that carries variants is an A/B test even if the flag is stale.
  const showVariants = isAbTest || variants.length > 0;
  const canEditVariants = showVariants && c?.status === 'DRAFT';

  // Approved templates for variant labels + the draft-edit Select.
  const { data: varTplData } = useQuery({
    queryKey: ['wa-templates', 'approved'],
    queryFn: () => svc.listTemplates({ status: 'APPROVED', limit: 100 }),
    enabled: showVariants,
  });
  const varTemplates = varTplData?.data?.items ?? [];
  const varTplOptions = varTemplates.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.category})`,
  }));
  const varTemplateName = (tid: string) => varTemplates.find((t) => t.id === tid)?.name;

  const [draftVariants, setDraftVariants] = useState<VariantDraft[] | null>(null);
  const beginEditingVariants = () =>
    setDraftVariants(
      (variants.length
        ? variants
        : [
            { label: 'Variant A', templateId: '', weight: 50 },
            { label: 'Variant B', templateId: '', weight: 50 },
          ]
      ).map((v) => ({ label: v.label, templateId: v.templateId, weight: String(v.weight) })),
    );
  const updateDraftVariant = (index: number, patch: Partial<VariantDraft>) =>
    setDraftVariants((prev) =>
      prev ? prev.map((v, i) => (i === index ? { ...v, ...patch } : v)) : prev,
    );
  const addDraftVariant = () =>
    setDraftVariants((prev) =>
      prev
        ? [
            ...prev,
            {
              label: `Variant ${String.fromCharCode(65 + prev.length)}`,
              templateId: '',
              weight: '50',
            },
          ]
        : prev,
    );
  const removeDraftVariant = (index: number) =>
    setDraftVariants((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));

  const variantsMut = useMutation({
    mutationFn: () => {
      const payload: WaCampaignVariant[] = (draftVariants ?? []).map((v, i) => ({
        label: v.label.trim() || `Variant ${String.fromCharCode(65 + i)}`,
        templateId: v.templateId,
        weight: Math.max(1, parseInt(v.weight, 10) || 1),
      }));
      return svc.setCampaignVariants(id, payload);
    },
    onSuccess: () => {
      showToast.success('Variants saved');
      setDraftVariants(null);
      qc.invalidateQueries({ queryKey: ['wa-campaign-variants', id] });
      qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to save variants'),
  });

  const saveVariants = () => {
    if (!draftVariants || draftVariants.length < 2)
      return showToast.error('An A/B test needs at least two variants');
    if (draftVariants.some((v) => !v.templateId))
      return showToast.error('Every variant needs an approved template');
    variantsMut.mutate();
  };

  if (isError && !c) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="whatsapp.campaigns.view"
      >
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-[var(--text-muted)]">Couldn’t load this campaign.</p>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => refetch()}
            isLoading={isFetching}
          >
            Retry
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading || !c) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="whatsapp.campaigns.view"
      >
        <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
      </DashboardLayout>
    );
  }

  const done = c.sentCount + c.failedCount + c.skippedCount;
  const pct = c.totalRecipients ? Math.round((done / c.totalRecipients) * 100) : 0;
  const canLaunch = c.status === 'DRAFT' || c.status === 'SCHEDULED';
  const canResume = c.status === 'PAUSED';
  const canPause = c.status === 'RUNNING';
  const canCancel = ['RUNNING', 'PAUSED', 'SCHEDULED', 'QUEUED'].includes(c.status);
  const canRetry = c.failedCount > 0 && ['COMPLETED', 'PAUSED', 'RUNNING'].includes(c.status);
  const estCostPaise = c.estimatedCostPaise ?? preview?.estimatedCostPaise ?? 0;
  const hasActualCost = c.actualCostPaise != null;
  const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN');

  // Delivery funnel — each stage as a count + % of the campaign total.
  // `convertedCount` is a denormalized column on the campaign row (kept in
  // sync by the conversion service); the typed model doesn't yet expose it.
  const convertedCount = (c as { convertedCount?: number }).convertedCount ?? 0;
  const funnelTotal = c.totalRecipients || 0;
  const funnelData = [
    { name: 'Sent', count: c.sentCount, key: 'sent' },
    { name: 'Delivered', count: c.deliveredCount, key: 'delivered' },
    { name: 'Read', count: c.readCount, key: 'read' },
    { name: 'Replied', count: c.repliedCount, key: 'replied' },
    { name: 'Converted', count: convertedCount, key: 'converted' },
  ].map((stage) => ({
    ...stage,
    pct: funnelTotal ? Math.round((stage.count / funnelTotal) * 100) : 0,
  }));

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.campaigns.view"
    >
      <div className="space-y-6">
        <Link
          href={ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGNS}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to campaigns
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text)]">{c.name}</h1>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  CAMPAIGN_STATUS_STYLE[c.status],
                )}
              >
                {c.status}
              </span>
              <Badge variant={isSequence ? 'accent' : 'info'} size="sm">
                {isSequence ? 'SEQUENCE' : 'BROADCAST'}
              </Badge>
              {showVariants && (
                <Badge variant="warning" size="sm">
                  A/B TEST
                </Badge>
              )}
              {!!c.recurrenceDays && c.recurrenceDays > 0 && (
                <Badge variant="neutral" size="sm">
                  Repeats every {c.recurrenceDays}d
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Template: {c.template?.name ?? '—'} ({c.template?.category}) ·{' '}
              {c.template?.status !== 'APPROVED' && (
                <span className="text-[var(--error)]">template not approved</span>
              )}
              {isPreLaunch && preview && (
                <>
                  {' '}
                  ~{preview.count.toLocaleString('en-IN')} eligible recipients · est. ₹
                  {(preview.estimatedCostPaise / 100).toLocaleString('en-IN')}
                </>
              )}
            </p>
            {!!c.recurrenceDays && c.recurrenceDays > 0 && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Re-runs every {c.recurrenceDays} {c.recurrenceDays === 1 ? 'day' : 'days'}
                {c.nextRunAt && <> · next run {new Date(c.nextRunAt).toLocaleString('en-IN')}</>}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {canLaunch && (
              <Button
                leftIcon={<Play className="h-4 w-4" />}
                onClick={() => actionMut.mutate('launch')}
                isLoading={actionMut.isPending}
              >
                Launch
              </Button>
            )}
            {canResume && (
              <Button
                leftIcon={<RotateCw className="h-4 w-4" />}
                onClick={() => actionMut.mutate('resume')}
                isLoading={actionMut.isPending}
              >
                Resume
              </Button>
            )}
            {canPause && (
              <Button
                variant="secondary"
                leftIcon={<Pause className="h-4 w-4" />}
                onClick={() => actionMut.mutate('pause')}
                isLoading={actionMut.isPending}
              >
                Pause
              </Button>
            )}
            {canCancel && (
              <Button
                variant="secondary"
                leftIcon={<X className="h-4 w-4" />}
                onClick={() => actionMut.mutate('cancel')}
                isLoading={actionMut.isPending}
              >
                Cancel
              </Button>
            )}
            {canRetry && (
              <Button
                variant="secondary"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={() => retryMut.mutate()}
                isLoading={retryMut.isPending}
                disabled={retryMut.isPending}
              >
                Retry failed
              </Button>
            )}
          </div>
        </div>

        {/* Manage: edit/reschedule · duplicate · save-as-template · test-send */}
        <CampaignManageActions
          campaign={c}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
            qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
          }}
        />

        {/* Progress + counters */}
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Total" value={c.totalRecipients} />
            <Stat label="Sent" value={c.sentCount} />
            <Stat label="Delivered" value={c.deliveredCount} />
            <Stat label="Read" value={c.readCount} />
            <Stat label="Replied" value={c.repliedCount} />
            <Stat label="Failed" value={c.failedCount} />
            <Stat label="Est. cost" value={`₹${rupees(estCostPaise)}`} />
            <Stat
              label="Actual cost"
              value={hasActualCost ? `₹${rupees(c.actualCostPaise as number)}` : '—'}
            />
          </div>
        </div>

        {/* Delivery funnel: Sent → Delivered → Read → Replied → Converted */}
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text)]">Delivery funnel</h2>
            <span className="text-xs text-[var(--text-muted)]">
              % of {funnelTotal.toLocaleString('en-IN')} recipients
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--bg-secondary)' }} />
              <Bar dataKey="count" name="Recipients" radius={[0, 4, 4, 0]}>
                {funnelData.map((d, i) => (
                  <Cell key={d.key} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {funnelData.map((d, i) => (
              <div
                key={d.key}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-center"
              >
                <p className="flex items-center justify-center gap-1.5 text-base font-bold text-[var(--text)]">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
                  />
                  {d.count.toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {d.name} · {d.pct}%
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Conversions (attribution / ROI) */}
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-[var(--text)]">Conversions</h2>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              {convertedCount.toLocaleString('en-IN')} recorded
            </span>
          </div>

          {/* Record-conversion form */}
          <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
            <Input
              label="Value (₹, optional)"
              type="number"
              min={0}
              step="0.01"
              value={convValue}
              onChange={(e) => setConvValue(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="Note (optional)"
              value={convNote}
              onChange={(e) => setConvNote(e.target.value)}
              placeholder="e.g. signed up for Premium"
            />
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => conversionMut.mutate()}
              isLoading={conversionMut.isPending}
            >
              Record conversion
            </Button>
          </div>

          {/* Recorded conversions list */}
          {conversions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No conversions recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {conversions.map((conv) => (
                <li
                  key={conv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--text)]">
                      {conv.valuePaise != null ? `₹${rupees(conv.valuePaise)}` : 'No value'}
                    </span>
                    {conv.note && (
                      <span className="ml-2 text-[var(--text-secondary)]">{conv.note}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(conv.createdAt).toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sequence steps (drip) */}
        {isSequence && (
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Sequence steps</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Templates sent in order with per-step delay and reply conditions.
                </p>
              </div>
              {canEditSteps && draftSteps === null && (
                <Button size="sm" variant="secondary" onClick={beginEditing}>
                  Edit steps
                </Button>
              )}
              {canEditSteps && draftSteps !== null && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDraftSteps(null)}
                    disabled={stepsMut.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    leftIcon={<Save className="h-4 w-4" />}
                    onClick={saveSteps}
                    isLoading={stepsMut.isPending}
                  >
                    Save steps
                  </Button>
                </div>
              )}
            </div>

            {/* Read-only view */}
            {draftSteps === null && (
              <ol className="space-y-2">
                {steps.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">No steps configured.</p>
                )}
                {steps.map((s, i) => (
                  <li
                    key={s.id ?? i}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text)]">
                      {i + 1}
                    </span>
                    <span className="font-medium text-[var(--text)]">
                      {templateName(s.templateId) ?? s.templateId}
                    </span>
                    <Badge variant="neutral" size="sm">
                      +{s.delayHours}h
                    </Badge>
                    <Badge variant="info" size="sm">
                      {CONDITION_LABEL[s.condition]}
                    </Badge>
                  </li>
                ))}
              </ol>
            )}

            {/* Editable draft (DRAFT campaigns only) */}
            {draftSteps !== null && (
              <div className="space-y-3">
                {draftSteps.map((step, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-muted)]">
                        Step {i + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveDraft(i, -1)}
                          disabled={i === 0}
                          className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
                          aria-label="Move step up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDraft(i, 1)}
                          disabled={i === draftSteps.length - 1}
                          className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
                          aria-label="Move step down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDraft(i)}
                          disabled={draftSteps.length === 1}
                          className="rounded p-1 text-[var(--error)] hover:opacity-80 disabled:opacity-30"
                          aria-label="Remove step"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="sm:col-span-2 lg:col-span-1">
                        <Select
                          label="Template"
                          options={stepTplOptions}
                          value={step.templateId}
                          onChange={(v) => updateDraft(i, { templateId: v })}
                          placeholder={
                            stepTemplates.length ? 'Select a template' : 'No approved templates'
                          }
                        />
                      </div>
                      <Input
                        label="Delay (hours)"
                        type="number"
                        min={0}
                        value={step.delayHours}
                        onChange={(e) => updateDraft(i, { delayHours: e.target.value })}
                      />
                      <Select
                        label="Condition"
                        options={CONDITION_OPTIONS}
                        value={step.condition}
                        onChange={(v) =>
                          updateDraft(i, { condition: v as WaSequenceStep['condition'] })
                        }
                        clearable={false}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={addDraft}
                >
                  Add step
                </Button>
              </div>
            )}
          </div>
        )}

        {/* A/B variants performance */}
        {showVariants && (
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">A/B variants</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Each variant sends a different template; performance is tracked per variant.
                </p>
              </div>
              {canEditVariants && draftVariants === null && (
                <Button size="sm" variant="secondary" onClick={beginEditingVariants}>
                  Edit variants
                </Button>
              )}
              {canEditVariants && draftVariants !== null && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDraftVariants(null)}
                    disabled={variantsMut.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    leftIcon={<Save className="h-4 w-4" />}
                    onClick={saveVariants}
                    isLoading={variantsMut.isPending}
                  >
                    Save variants
                  </Button>
                </div>
              )}
            </div>

            {/* Editable draft (DRAFT campaigns only) */}
            {draftVariants !== null ? (
              <CampaignVariantBuilder
                variants={draftVariants}
                templateOptions={varTplOptions}
                hasTemplates={varTemplates.length > 0}
                onChange={updateDraftVariant}
                onAdd={addDraftVariant}
                onRemove={removeDraftVariant}
              />
            ) : variants.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No variants configured.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold text-[var(--text-muted)]">
                      <th className="px-2 py-2">Variant</th>
                      <th className="px-2 py-2">Template</th>
                      <th className="px-2 py-2 text-right">Weight</th>
                      <th className="px-2 py-2 text-right">Sent</th>
                      <th className="px-2 py-2 text-right">Delivered</th>
                      <th className="px-2 py-2 text-right">Read</th>
                      <th className="px-2 py-2 text-right">Replied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v, i) => (
                      <tr
                        key={v.id ?? i}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-2 py-2 font-medium text-[var(--text)]">{v.label}</td>
                        <td className="px-2 py-2 text-[var(--text-secondary)]">
                          {varTemplateName(v.templateId) ?? v.templateId}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                          {v.weight}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--text)]">
                          {(v.sentCount ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--text)]">
                          {(v.deliveredCount ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--text)]">
                          {(v.readCount ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--text)]">
                          {(v.repliedCount ?? 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Trackable short links */}
        <CampaignLinksSection campaignId={id} />

        {/* Recipients */}
        {c.status !== 'DRAFT' && (
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">Recipients</h2>
              <button
                type="button"
                onClick={() => svc.exportRecipients(id)}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text)]"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
            {recipients.length === 0 && (
              <p className="p-6 text-center text-sm text-[var(--text-muted)]">No recipients yet.</p>
            )}
            {recipients.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-[var(--text)]">
                  {r.contact.name || r.contact.phone}
                  <span className="ml-2 text-xs text-[var(--text-muted)]">{r.contact.phone}</span>
                </span>
                <div className="flex items-center gap-2">
                  {r.errorCode && (
                    <span className="text-[10px] text-[var(--error)]">{r.errorCode}</span>
                  )}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      RECIP_STYLE[r.status],
                    )}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
