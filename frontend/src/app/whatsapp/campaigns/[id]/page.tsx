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
  Send,
  Target,
  Trophy,
  AlertTriangle,
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
import { confirmDialog } from '@/components/ui/dialog-service';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { whatsappService as svc } from '@/services/whatsapp.service';
import CampaignVariantBuilder, {
  type VariantDraft,
} from '@/components/whatsapp/CampaignVariantBuilder';
import CampaignManageActions from '@/components/whatsapp/CampaignManageActions';
import TemplatePreviewBubble from '@/components/whatsapp/TemplatePreviewBubble';
import TemplatePicker, { useTemplatesByIds } from '@/components/whatsapp/TemplatePicker';
import {
  resolveSampleToken,
  usesSampleContact,
  SAMPLE_CONTACT_NOTE,
} from '@/lib/whatsapp-template-vars';
import CampaignLinksSection from '@/components/whatsapp/CampaignLinksSection';
import { CAMPAIGN_STATUS_STYLE } from '@/components/whatsapp/campaign-status-style';
import type {
  WaAbMetric,
  WaAbVariantStat,
  WaCampaignRecipientStatus,
  WaCampaignTemplateParams,
  WaSequenceStep,
  WaCampaignVariant,
} from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const CONDITION_OPTIONS = [
  { value: 'any', label: 'Always send' },
  { value: 'no_reply', label: 'Only if no reply yet' },
  { value: 'replied', label: 'Only if they replied' },
];

/** Which rate an A/B test is judged on, and how the column reads. */
const AB_METRIC_OPTIONS: Array<{ value: WaAbMetric; label: string }> = [
  { value: 'replied', label: 'Reply rate' },
  { value: 'read', label: 'Read rate' },
  { value: 'delivered', label: 'Delivery rate' },
];

const AB_METRIC_LABEL: Record<WaAbMetric, string> = {
  replied: 'Reply rate',
  read: 'Read rate',
  delivered: 'Delivery rate',
};

/** A 0-1 rate as one decimal percent; em-dash when the variant sent nothing. */
const ratePct = (rate: number | null): string =>
  rate == null ? '—' : `${Math.round(rate * 1000) / 10}%`;

const CONDITION_LABEL: Record<WaSequenceStep['condition'], string> = {
  any: 'Always',
  no_reply: 'If no reply',
  replied: 'If replied',
};

// Funnel stage colors, matched to the recipient-status palette used elsewhere.
// Sent → Delivered → Read → Clicked → Replied → Converted.
//
// "Clicked" sits between Read and Replied because it is the first ACTION in the
// funnel: a read receipt says the message was opened, a click says the offer
// worked. Its absence is why click-through could not be read anywhere.
const FUNNEL_COLORS = ['#0ea5e9', '#6366f1', '#22c55e', '#a855f7', '#10b981', '#f59e0b'] as const;

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

  // Meta messaging-tier headroom, returned alongside the count and the cost.
  // Meta caps how many DISTINCT contacts the number may start a conversation
  // with per 24h; past that it refuses every further send with 131056, which is
  // what downgrades the number's quality rating — so an audience bigger than the
  // allowance has to be stated here, before Launch, not discovered from a screen
  // full of failures.
  // Meta's own send eligibility for this number + template. Separate query from
  // the audience preview because it makes live Graph calls, and a slow or
  // unreachable Meta must not hold up the recipient count.
  const { data: preflightData } = useQuery({
    queryKey: ['wa-campaign-preflight', id],
    queryFn: () => svc.campaignPreflight(id),
    enabled: isPreLaunch,
    staleTime: 5 * 60 * 1000,
  });
  const preflight = preflightData?.data ?? null;
  // Only a definite refusal is worth interrupting a launch for; a check that
  // could not be made is reported, never treated as a block.
  const preflightBlocked =
    preflight?.checked === true && !!preflight.canSend && preflight.canSend !== 'AVAILABLE';

  const tierLimit = preview?.tierLimit ?? null;
  const tierRemaining = Math.max(0, (tierLimit ?? 0) - (preview?.uniqueSentLast24h ?? 0));
  const exceedsTier = preview?.exceedsTier === true && tierLimit !== null;
  const tierSpreadDays = tierLimit ? Math.ceil((preview?.count ?? 0) / tierLimit) : 0;
  // Personalisation slots that resolve to nothing for part of the audience. Meta
  // rejects an empty parameter and fails the WHOLE message, so this is a hard
  // failure for those recipients, not a cosmetic one.
  const blankVariables = preview?.blankVariables ?? [];

  // The template itself, not just the name denormalized onto the campaign row.
  // This page could say WHICH template would go out but never WHAT it says, so
  // a draft was launched to the whole audience without the finished message
  // ever being read once. Skipped for sequences and A/B tests: their values live
  // per step / per variant, and those are previewed from their own templates.
  const { data: campaignTplData } = useQuery({
    queryKey: ['wa-template', c?.templateId],
    queryFn: () => svc.getTemplate(String(c?.templateId)),
    enabled: !!c?.templateId && c.type !== 'SEQUENCE' && c.isAbTest !== true,
  });
  const campaignTemplate = campaignTplData?.data ?? null;

  // Page + status filter. The list was pinned to the first 50 recipients with
  // no way to move or filter, so on any real campaign the one question this
  // panel exists to answer — "which recipients failed?" — was unanswerable
  // unless the failures happened to be in the first 50 rows. Both parameters
  // were already supported by the service and the backend.
  //
  // Paging is keyset now, so "page 7" is the seventh cursor in this stack rather
  // than an offset the database has to count its way to. The stack is what makes
  // Back free: index 0 is the first page (no cursor), and each entry after it is
  // the cursor that opened that page.
  const [recipCursors, setRecipCursors] = useState<Array<string | null>>([null]);
  const [recipPage, setRecipPage] = useState(1);
  const [recipStatus, setRecipStatus] = useState('');
  // "Clicked" is not a recipient STATUS (a click happens after DELIVERED/READ
  // and does not replace it), so it is its own filter — this is what turns
  // "47 clicks" into the list of people to follow up with.
  const [recipClicked, setRecipClicked] = useState(false);

  const recipCursor = recipCursors[recipPage - 1] ?? null;
  const { data: recipData } = useQuery({
    queryKey: ['wa-recipients', id, recipCursor, recipStatus, recipClicked],
    queryFn: () =>
      svc.getRecipients(id, {
        cursor: recipCursor ?? undefined,
        limit: 50,
        status: recipStatus || undefined,
        clicked: recipClicked || undefined,
      }),
    refetchInterval: 8_000,
    enabled: !!c && c.status !== 'DRAFT',
  });
  const recipients = recipData?.data?.items ?? [];
  const recipNextCursor = recipData?.data?.nextCursor ?? null;
  // The total only rides along with the first page of a filter — hold on to it
  // so paging deeper does not blank the count in the header.
  const [recipTotal, setRecipTotal] = useState(0);
  // Adjusted during render rather than from an effect: an effect would commit one
  // frame showing the previous count before correcting itself, and React
  // discards this render before painting instead.
  const recipTotalNow = recipData?.data?.total;
  if (typeof recipTotalNow === 'number' && recipTotalNow !== recipTotal) {
    setRecipTotal(recipTotalNow);
  }

  /** Restart paging — any filter change invalidates every cursor after the first. */
  const resetRecipPaging = () => {
    setRecipCursors([null]);
    setRecipPage(1);
    setRecipTotal(0);
  };

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

  // An over-tier launch is not refused — the send stops at the daily allowance and
  // resumes as the 24h window rolls off — but it does change what the operator is
  // agreeing to (a promo that lands over days, not minutes), so it is confirmed.
  const launch = async () => {
    // Meta will refuse the send outright for a BLOCKED number or template, and
    // throttle a LIMITED one. Launching regardless costs the whole audience —
    // every recipient is materialized and then fails one at a time — so this is
    // stated before the button does anything, not discovered from the results.
    if (preflightBlocked && preflight) {
      const detail = preflight.blockers
        .map(
          (b) =>
            `${b.type}: ${b.canSend}` +
            (b.errors.length ? ` — ${b.errors.map((e) => e.description).join('; ')}` : ''),
        )
        .join('\n');
      const ok = await confirmDialog({
        title: `Meta reports this campaign as ${preflight.canSend}`,
        message:
          'Meta’s pre-flight check says this number or template is not free to send:\n' +
          `${detail || 'no detail given'}\n\n` +
          'Launching now will fail some or all recipients. Launch anyway?',
        confirmLabel: 'Launch anyway',
        variant: 'danger',
      });
      if (!ok) return;
    }
    if (exceedsTier && tierLimit !== null) {
      const ok = await confirmDialog({
        title: 'Audience exceeds this number’s messaging tier',
        message:
          `${(preview?.count ?? 0).toLocaleString('en-IN')} eligible recipients, but only ` +
          `${tierRemaining.toLocaleString('en-IN')} of the ${tierLimit.toLocaleString('en-IN')} ` +
          'contacts Meta allows per 24h are left in the current window. The send will stop at the ' +
          `limit and continue as the window rolls off — about ${tierSpreadDays} day(s) in total. ` +
          'Launch anyway?',
        confirmLabel: 'Launch anyway',
        variant: 'warning',
      });
      if (!ok) return;
    }
    actionMut.mutate('launch');
  };

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
  const conversions = conversionsData?.data?.items ?? [];
  const conversionsTotal = conversionsData?.data?.total ?? 0;

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

  // A mistyped ₹ value or a double-clicked button used to be permanent, and it
  // inflated both convertedCount and total revenue with nothing to correct it.
  const deleteConversionMut = useMutation({
    mutationFn: (conversionId: string) => svc.deleteConversion(conversionId),
    onSuccess: () => {
      showToast.success('Conversion deleted');
      qc.invalidateQueries({ queryKey: ['wa-campaign-conversions', id] });
      qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to delete conversion'),
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

  // Templates behind the steps, resolved per referenced id. The read-only step
  // list needs them for its names and message previews, and it used to read them
  // out of the first 100 approved templates — so on a WABA past that ceiling a
  // launched sequence printed raw template ids and no message at all.
  const stepTemplate = useTemplatesByIds(steps.map((s) => s.templateId));
  const templateName = (tid: string) => stepTemplate(tid)?.name;

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

  // Click-through for this campaign. Clicks were collected and then discarded:
  // the funnel had no Clicked stage and the variant table judged an A/B test on
  // read receipts, which say nothing about whether the offer worked.
  const { data: clicksData } = useQuery({
    queryKey: ['wa-campaign-clicks', id],
    queryFn: () => svc.getCampaignClicks(id),
    refetchInterval: 60_000,
  });
  const clicks = clicksData?.data ?? null;
  const variantClicks = (variantId?: string) =>
    (variantId && clicks?.variants.find((v) => v.variantId === variantId)?.uniqueClickers) || 0;
  /** Unique clickers over what that variant delivered, as a percentage. */
  const variantCtr = (v: { id?: string; deliveredCount?: number }) => {
    const delivered = v.deliveredCount ?? 0;
    if (!delivered) return '—';
    return `${Math.round((variantClicks(v.id) / delivered) * 1000) / 10}%`;
  };
  // A campaign that carries variants is an A/B test even if the flag is stale.
  const showVariants = isAbTest || variants.length > 0;
  const canEditVariants = showVariants && c?.status === 'DRAFT';

  // Read-only variant labels resolve per id, so they stay correct on a
  // catalogue larger than one page.
  const varTemplate = useTemplatesByIds(variants.map((v) => v.templateId));
  const varTemplateName = (tid: string) => varTemplate(tid)?.name;

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
    // A blank mapping slot is sent to Meta as an empty parameter, which fails
    // the WHOLE message for every recipient of that variant.
    const badVariant = draftVariants.find((v) => (v.variableMapping ?? []).some((m) => !m?.trim()));
    if (badVariant)
      return showToast.error(
        `${badVariant.label || 'A variant'} has a variable with no value — pick a token or type a literal`,
      );
    variantsMut.mutate();
  };

  // ── A/B decision (rates, significance, winner, remainder) ──
  //
  // The variant table used to be four raw counters, so judging a test meant doing
  // the division by hand, guessing whether a gap was noise, and then hand-building
  // a second campaign to send the better template to everyone else.
  const { data: abData } = useQuery({
    queryKey: ['wa-campaign-ab', id],
    queryFn: () => svc.getAbTest(id),
    enabled: showVariants && c?.status !== 'DRAFT',
    refetchInterval: 60_000,
  });
  const ab = abData?.data ?? null;
  const abStat = (variantId?: string): WaAbVariantStat | null =>
    (variantId && ab?.variants.find((v) => v.id === variantId)) || null;
  const abMetric: WaAbMetric = ab?.metric ?? 'replied';
  const leaderLabel = variants.find((v) => v.id === ab?.leaderVariantId)?.label ?? null;
  const winnerLabel = variants.find((v) => v.id === ab?.winnerVariantId)?.label ?? null;

  const invalidateAb = () => {
    qc.invalidateQueries({ queryKey: ['wa-campaign-ab', id] });
    qc.invalidateQueries({ queryKey: ['wa-campaign-variants', id] });
    qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
  };

  const winnerMut = useMutation({
    mutationFn: (variantId?: string) => svc.selectAbWinner(id, variantId ? { variantId } : {}),
    onSuccess: () => {
      showToast.success('Winner recorded');
      invalidateAb();
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Could not pick a winner'),
  });

  const metricMut = useMutation({
    mutationFn: (metric: WaAbMetric) => svc.updateCampaign(id, { abTestMetric: metric }),
    onSuccess: () => invalidateAb(),
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Could not change metric'),
  });

  const remainderMut = useMutation({
    mutationFn: () => svc.sendAbRemainder(id),
    onSuccess: (res) => {
      showToast.success(
        `Sending to ${(res.data?.added ?? 0).toLocaleString('en-IN')} more contacts with the winning variant`,
      );
      invalidateAb();
      qc.invalidateQueries({ queryKey: ['wa-recipients', id] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Could not send the remainder'),
  });

  const confirmRemainder = async () => {
    const ok = await confirmDialog({
      title: `Send to the remaining ${(ab?.remainingAudience ?? 0).toLocaleString('en-IN')} contacts?`,
      message: `Everyone eligible who has not been messaged yet receives ${winnerLabel ?? 'the winning variant'}. The test sample is left exactly as it is.`,
      confirmLabel: 'Send remainder',
    });
    if (ok) remainderMut.mutate();
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

  // Saved send values: the per-recipient body mapping plus the campaign-wide
  // header / button parameters. `templateParams` is persisted on the campaign
  // but not yet modelled on the client type.
  const storedMapping = Array.isArray(c.variableMapping) ? (c.variableMapping as string[]) : [];
  const storedParams = (c as { templateParams?: WaCampaignTemplateParams }).templateParams ?? {};
  const funnelTotal = c.totalRecipients || 0;
  const funnelData = [
    { name: 'Sent', count: c.sentCount, key: 'sent' },
    { name: 'Delivered', count: c.deliveredCount, key: 'delivered' },
    { name: 'Read', count: c.readCount, key: 'read' },
    // Unique clickers, not raw clicks: one person opening the link five times is
    // one recipient who acted, and the other stages count recipients too.
    { name: 'Clicked', count: clicks?.uniqueClickers ?? 0, key: 'clicked' },
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
            {isPreLaunch && preflightBlocked && preflight && (
              <div className="mt-1 flex items-start gap-1.5 text-xs text-red-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <div>
                  <p>
                    Meta reports this campaign as <strong>{preflight.canSend}</strong> — the number,
                    its WhatsApp Business Account or the template is not free to send.
                  </p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {preflight.blockers.map((b, i) => (
                      <li key={`${b.type}-${b.id ?? i}`}>
                        {b.type}: {b.canSend}
                        {b.errors.length > 0 &&
                          ` — ${b.errors.map((e) => e.description).join('; ')}`}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {isPreLaunch && preflight && !preflight.checked && preflight.errors.length > 0 && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Meta’s send-eligibility check could not be made ({preflight.errors.join('; ')}).
              </p>
            )}
            {isPreLaunch && exceedsTier && tierLimit !== null && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  Over this number’s Meta messaging tier: {tierRemaining.toLocaleString('en-IN')} of{' '}
                  {tierLimit.toLocaleString('en-IN')} contacts left in the current 24h window. The
                  send stops at the limit and continues as the window rolls off — about{' '}
                  {tierSpreadDays} day(s) for the whole audience.
                </span>
              </p>
            )}
            {isPreLaunch &&
              blankVariables.map((v) => (
                <p key={v.index} className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    {v.blankCount.toLocaleString('en-IN')} of the eligible recipients have no value
                    for {`{{${v.index}}}`} ({v.token}). Meta refuses an empty parameter, so those
                    messages fail — edit the mapping to {'{{name|there}}'} to give them a fallback.
                  </span>
                </p>
              ))}
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
                onClick={launch}
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

        {/* Manage: edit · audience · template · schedule · duplicate · save-as-template · test-send */}
        <CampaignManageActions
          campaign={c}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['wa-campaign', id] });
            qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
            // The edit modal can now change the audience, so the pre-launch
            // preview must be re-fetched — otherwise the recipient count and
            // estimated cost shown above keep describing the OLD audience and
            // the operator launches against numbers that no longer apply.
            qc.invalidateQueries({ queryKey: ['wa-campaign-preview', id] });
          }}
        />

        {/* The message itself, rendered with the campaign's saved values — the
            last chance to catch a transposed mapping before Launch. Sequences
            and A/B tests carry their values per step / per variant, so they are
            previewed there instead; the campaign row's own mapping is empty for
            them and would render a misleading all-placeholders message. */}
        <TemplatePreviewBubble
          template={isSequence || showVariants ? null : campaignTemplate}
          values={{
            bodyParams: storedMapping.map(resolveSampleToken),
            headerText: storedParams.headerText,
            headerMediaUrl: storedParams.headerMediaUrl,
            buttonUrlParam: storedParams.buttonUrlParam,
            // The carousel cards as saved — for a carousel campaign the cards ARE
            // the message, so a preview without them shows the bubble alone.
            carouselCards: storedParams.carouselCards,
          }}
          note={usesSampleContact(storedMapping) ? SAMPLE_CONTACT_NOTE : undefined}
          className="bg-white"
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
              {conversionsTotal > conversions.length && (
                <li className="text-xs text-[var(--text-muted)]">
                  Showing the {conversions.length} most recent of{' '}
                  {conversionsTotal.toLocaleString('en-IN')} conversions.
                </li>
              )}
              {conversions.map((conv) => (
                <li
                  key={conv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--text)]">
                      {conv.valuePaise != null ? `₹${rupees(conv.valuePaise)}` : 'No value'}
                    </span>
                    {conv.source === 'api' && (
                      <span className="ml-2 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                        API
                      </span>
                    )}
                    {conv.note && (
                      <span className="ml-2 text-[var(--text-secondary)]">{conv.note}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Date(conv.occurredAt ?? conv.createdAt).toLocaleString('en-IN')}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteConversionMut.mutate(conv.id)}
                      disabled={deleteConversionMut.isPending}
                      aria-label="Delete conversion"
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--error)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                  Templates sent in order with per-step delay and reply conditions. The delay on
                  step 1 is counted from launch; every later step from the previous send.
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
                    className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>
                    <TemplatePreviewBubble
                      template={stepTemplate(s.templateId)}
                      values={{ bodyParams: (s.variableMapping ?? []).map(resolveSampleToken) }}
                      note={
                        usesSampleContact(s.variableMapping ?? []) ? SAMPLE_CONTACT_NOTE : undefined
                      }
                      className="bg-white"
                    />
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
                        <TemplatePicker
                          label="Template"
                          value={step.templateId}
                          onChange={(t) => updateDraft(i, { templateId: t?.id ?? '' })}
                        />
                      </div>
                      <Input
                        label="Delay (hours)"
                        type="number"
                        min={0}
                        value={step.delayHours}
                        onChange={(e) => updateDraft(i, { delayHours: e.target.value })}
                        helperText={i === 0 ? 'Counted from launch' : 'After the previous step'}
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

            {/* The decision. Rates, a significance verdict and the two actions a
                test is run for: name the winner, then send it to everyone the
                sample held back. */}
            {ab && variants.length > 1 && draftVariants === null && (
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="w-48">
                    <Select
                      label="Judge on"
                      options={AB_METRIC_OPTIONS}
                      value={abMetric}
                      // Locked while the change is in flight: the value is read
                      // back from the report, so a second pick before the
                      // refetch lands would be made against the old number.
                      disabled={metricMut.isPending}
                      onChange={(v) => metricMut.mutate(v as WaAbMetric)}
                      clearable={false}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Trophy className="h-4 w-4" />}
                      isLoading={winnerMut.isPending}
                      disabled={!ab.leaderVariantId}
                      onClick={() => winnerMut.mutate(undefined)}
                    >
                      {ab.winnerVariantId
                        ? 'Re-pick the leader'
                        : `Declare ${leaderLabel ?? 'the leader'} the winner`}
                    </Button>
                    {ab.remainingAudience > 0 && (
                      <Button
                        size="sm"
                        leftIcon={<Send className="h-4 w-4" />}
                        isLoading={remainderMut.isPending}
                        disabled={!ab.winnerVariantId}
                        onClick={() => void confirmRemainder()}
                      >
                        Send to the remaining {ab.remainingAudience.toLocaleString('en-IN')}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {ab.winnerVariantId
                    ? `${winnerLabel ?? 'A variant'} is the recorded winner${ab.decidedAt ? ` (${new Date(ab.decidedAt).toLocaleString('en-IN')})` : ''}. `
                    : ab.leaderVariantId
                      ? `${leaderLabel ?? 'A variant'} leads on ${AB_METRIC_LABEL[abMetric].toLowerCase()}${ab.significant ? ' and the gap clears 95% confidence' : ', but the gap is still within noise'}. `
                      : 'No variant has sent anything yet, so there is nothing to compare. '}
                  {ab.samplePct
                    ? `Launch used ${ab.samplePct}% of the audience as the test sample.`
                    : 'This campaign was launched to the whole audience, so there is no held-back remainder.'}
                </p>
              </div>
            )}

            {/* Editable draft (DRAFT campaigns only) */}
            {draftVariants !== null ? (
              <CampaignVariantBuilder
                variants={draftVariants}
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
                      <th className="px-2 py-2 text-right">Clicked</th>
                      <th className="px-2 py-2 text-right">CTR</th>
                      <th className="px-2 py-2 text-right">Replied</th>
                      <th className="px-2 py-2 text-right">{AB_METRIC_LABEL[abMetric]}</th>
                      <th className="px-2 py-2 text-right">Lift</th>
                      <th className="px-2 py-2 text-right">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v, i) => (
                      <tr
                        key={v.id ?? i}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="px-2 py-2 font-medium text-[var(--text)]">
                          <span className="inline-flex items-center gap-1.5">
                            {v.label}
                            {abStat(v.id)?.isWinner && (
                              <Badge variant="success" size="sm">
                                WINNER
                              </Badge>
                            )}
                          </span>
                        </td>
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
                          {variantClicks(v.id).toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-emerald-600">
                          {variantCtr(v)}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--text)]">
                          {(v.repliedCount ?? 0).toLocaleString('en-IN')}
                        </td>
                        {/* The three columns the test is actually decided on. A
                            counts-only table made "9 of 40 vs 7 of 38" look like a
                            28% win when it is pure noise. */}
                        <td className="px-2 py-2 text-right font-semibold text-[var(--text)]">
                          {ratePct(abStat(v.id)?.rate ?? null)}
                        </td>
                        <td
                          className={cn(
                            'px-2 py-2 text-right',
                            (abStat(v.id)?.liftPct ?? 0) > 0
                              ? 'text-emerald-600'
                              : (abStat(v.id)?.liftPct ?? 0) < 0
                                ? 'text-[var(--error)]'
                                : 'text-[var(--text-secondary)]',
                          )}
                        >
                          {abStat(v.id)?.liftPct == null
                            ? '—'
                            : `${(abStat(v.id)!.liftPct! > 0 ? '+' : '') + (Math.round(abStat(v.id)!.liftPct! * 10) / 10).toString()} pp`}
                        </td>
                        <td className="px-2 py-2 text-right text-xs">
                          {abStat(v.id)?.z == null ? (
                            <span className="text-[var(--text-muted)]">Not enough data</span>
                          ) : abStat(v.id)!.significant ? (
                            <Badge variant="success" size="sm">
                              95%
                            </Badge>
                          ) : (
                            <span className="text-[var(--text-muted)]">Within noise</span>
                          )}
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Recipients
                {recipTotal > 0 && (
                  <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                    {recipTotal.toLocaleString('en-IN')}
                    {recipStatus ? ` ${recipStatus.toLowerCase()}` : ''}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Filter recipients by status"
                  value={recipStatus}
                  onChange={(e) => {
                    setRecipStatus(e.target.value);
                    resetRecipPaging();
                  }}
                  className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--text)]"
                >
                  <option value="">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="SENT">Sent</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="READ">Read</option>
                  <option value="FAILED">Failed</option>
                  <option value="SKIPPED">Skipped</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={recipClicked}
                    onChange={(e) => {
                      setRecipClicked(e.target.checked);
                      resetRecipPaging();
                    }}
                  />
                  Clicked a link
                </label>
                <button
                  type="button"
                  onClick={() => svc.exportRecipients(id)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text)]"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
            </div>
            {recipients.length === 0 && (
              <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                {recipClicked
                  ? 'No recipient has clicked a link yet.'
                  : recipStatus
                    ? `No ${recipStatus.toLowerCase()} recipients.`
                    : 'No recipients yet.'}
              </p>
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
                  {r.clickedAt && (
                    <span
                      title={`Clicked ${new Date(r.clickedAt).toLocaleString('en-IN')}`}
                      className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
                    >
                      CLICKED
                    </span>
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
            {(recipPage > 1 || recipNextCursor) && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-xs text-[var(--text-muted)]">
                  Page {recipPage}
                  {recipTotal > 0 && ` of ${recipTotal.toLocaleString('en-IN')} recipients`}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={recipPage === 1}
                    onClick={() => setRecipPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!recipNextCursor}
                    onClick={() => {
                      if (!recipNextCursor) return;
                      setRecipCursors((cs) => {
                        const next = cs.slice(0, recipPage);
                        next.push(recipNextCursor);
                        return next;
                      });
                      setRecipPage((p) => p + 1);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
