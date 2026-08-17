'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  Plus,
  X,
  FileText,
  Loader2,
  Search,
  BarChart3,
  AlertTriangle,
  Pencil,
  Trash2,
  ExternalLink,
  Eye,
  Languages,
  Send,
  BookOpen,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import Pagination from '@/components/ui/Pagination';
import TemplateBuilder from '@/components/whatsapp/TemplateBuilder';
import TemplatePreviewBubble from '@/components/whatsapp/TemplatePreviewBubble';
import TemplateLibraryModal from '@/components/whatsapp/TemplateLibraryModal';
import { analyzeTemplate, templateExamples } from '@/lib/whatsapp-template-vars';
import type {
  WaTemplate,
  WaTemplateAnalytics,
  WaTemplateQuality,
  WaTemplateStatus,
} from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const CATEGORY_OPTIONS = [
  { value: 'UTILITY', label: 'Utility (transactional)' },
  { value: 'MARKETING', label: 'Marketing (promotional)' },
  { value: 'AUTHENTICATION', label: 'Authentication (OTP)' },
];

/**
 * Deep link into Meta's own template manager for this WABA.
 *
 * An appeal is the one template action Meta exposes no Graph endpoint for — it
 * happens in Business Manager and nowhere else. A rejected template was still a
 * dead end here even after edit and delete landed, because the operator had no
 * idea where to go; a link that lands on the right WABA is the honest fix, and
 * pretending to implement an appeal would not be.
 */
const templateManagerUrl = (wabaId: string | null) =>
  `https://business.facebook.com/wa/manage/message-templates/${wabaId ? `?waba_id=${encodeURIComponent(wabaId)}` : ''}`;

/** Statuses Meta lets you appeal or fix from the template manager. */
const APPEALABLE: WaTemplateStatus[] = ['REJECTED', 'PAUSED', 'DISABLED'];

/** Statuses that have never reached Meta — a local draft, not a submission. */
const DRAFT_STATUSES: WaTemplateStatus[] = ['LOCAL', 'DRAFT'];

/**
 * Meta's rejection codes in plain English.
 *
 * The raw enum was printed verbatim, so the single most important sentence in
 * the whole lifecycle — why this template was refused and what to change — read
 * as `Rejected: TAG_CONTENT_MISMATCH`. The code is still shown alongside, both
 * because it is what Meta support asks for and because an unmapped code must
 * never disappear.
 */
const REJECTION_REASON_HELP: Record<string, string> = {
  INVALID_FORMAT:
    'The structure is wrong — usually a missing example for a variable, a placeholder that is not numbered 1…n, or formatting Meta does not accept. Fix the components and resubmit.',
  ABUSIVE_CONTENT:
    'Meta read the content as abusive, threatening or harassing. Rewrite the copy in neutral language before resubmitting.',
  SCAM: 'Meta read the message as a scam or phishing attempt — often a shortened link, an urgent payment demand, or a request for credentials. Remove those and resubmit.',
  TAG_CONTENT_MISMATCH:
    'The content does not match the category you submitted it under. Promotional copy has to go in MARKETING; only genuinely transactional messages qualify as UTILITY.',
  INCORRECT_CATEGORY:
    'Meta classified this template into a different category than the one submitted. Resubmit under the category Meta assigns.',
  PROMOTIONAL:
    'A UTILITY or AUTHENTICATION template cannot carry promotional content. Move the offer into a MARKETING template.',
};

/** The explanation for a rejection code, if we have one. */
const rejectionHelp = (code: string | null | undefined): string | null =>
  code ? (REJECTION_REASON_HELP[code.trim().toUpperCase()] ?? null) : null;

/** Meta's own policy page — the next step for a rejection we cannot explain. */
const TEMPLATE_POLICY_URL =
  'https://business.whatsapp.com/policy#business-messaging-policy-message-template-guidelines';

const STATUS_STYLE: Record<WaTemplateStatus, string> = {
  APPROVED: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  IN_APPEAL: 'bg-amber-100 text-amber-700',
  DRAFT: 'bg-gray-100 text-gray-600',
  LOCAL: 'bg-gray-100 text-gray-600',
  REJECTED: 'bg-red-100 text-red-700',
  DISABLED: 'bg-red-100 text-red-700',
  PAUSED: 'bg-orange-100 text-orange-700',
};
const QUALITY_DOT: Record<WaTemplateQuality, string> = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  RED: 'bg-red-500',
  UNKNOWN: 'bg-gray-300',
};

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-center">
      <p className={cn('text-2xl font-bold tabular-nums', accent)}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

/** Small horizontal progress bar for a 0–100 rate. */
function RateBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--text)] tabular-nums">{clamped}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function TemplateAnalyticsModal({
  template,
  onClose,
}: {
  template: WaTemplate;
  onClose: () => void;
}) {
  // Lifetime totals hid the thing an operator opens this for: a template whose
  // delivery collapsed this week still averaged fine over a year of history.
  const [days, setDays] = useState<number | undefined>(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-template-analytics', template.id, days ?? 'all'],
    queryFn: () => svc.getTemplateAnalytics(template.id, days),
    enabled: !!template.id,
  });
  const a: WaTemplateAnalytics | undefined = data?.data;
  const rejectionReason = a?.template.rejectionReason ?? template.rejectionReason;

  return (
    <DialogShell onClose={onClose} label="Template analytics">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]">
              <BarChart3 className="h-5 w-5 text-emerald-600" /> Template Analytics
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-[var(--text-secondary)]">
                {template.name}
              </span>
              <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                {template.language}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  STATUS_STYLE[template.status],
                )}
              >
                {template.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {template.status === 'REJECTED' && rejectionReason && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="text-xs font-semibold text-red-700">Rejected by Meta</p>
              {/* The explanation first, the raw code second — the code is what
                  Meta support asks for, but on its own it is not actionable. */}
              <p className="mt-0.5 text-xs text-red-600">
                {rejectionHelp(rejectionReason) ?? rejectionReason}
              </p>
              {rejectionHelp(rejectionReason) && (
                <p className="mt-1 font-mono text-[10px] text-red-500">{rejectionReason}</p>
              )}
              <a
                href={TEMPLATE_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-700 underline"
              >
                Meta template guidelines <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
          </div>
        )}

        {!isLoading && (isError || !a) && (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">
            No analytics available for this template yet.
          </p>
        )}

        <div className="mb-4 flex gap-1">
          {[
            { v: 7, l: '7d' },
            { v: 30, l: '30d' },
            { v: 90, l: '90d' },
            { v: undefined, l: 'All' },
          ].map((o) => (
            <button
              key={o.l}
              onClick={() => setDays(o.v)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                days === o.v
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
              )}
            >
              {o.l}
            </button>
          ))}
        </div>

        {!isLoading && a && (
          <div className="space-y-4">
            <p className="text-[11px] text-[var(--text-muted)]">
              {template.language} only · {days ? `last ${days} days` : 'all time'}
            </p>
            <div className="grid grid-cols-4 gap-2">
              <StatTile label="Sent" value={a.sent} accent="text-[var(--text)]" />
              <StatTile label="Delivered" value={a.delivered} accent="text-emerald-600" />
              <StatTile label="Read" value={a.read} accent="text-blue-600" />
              <StatTile label="Failed" value={a.failed} accent="text-red-600" />
            </div>
            <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
              <RateBar label="Delivery rate" pct={a.deliveryRate} color="bg-emerald-500" />
              <RateBar label="Read rate" pct={a.readRate} color="bg-blue-500" />
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

/**
 * Read-only detail view of a template — what the recipient will actually get.
 *
 * The list row showed the BODY text and nothing else, so a media header, a
 * footer or a set of buttons were invisible from this page: telling two
 * near-identical templates apart meant reading the raw component JSON out of the
 * database. `GET /templates/:id` was implemented and had no caller here.
 *
 * The list row is used while the full record loads, so the drawer is never empty.
 */
function TemplateDetailDrawer({
  template,
  onClose,
}: {
  template: WaTemplate;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['wa-template', template.id],
    queryFn: () => svc.getTemplate(template.id),
  });
  const detail = data?.data ?? template;
  // The samples Meta approved with the template, so the preview reads as a real
  // message instead of a row of {{1}} holes. They are samples, never a send.
  const examples = useMemo(() => templateExamples(detail), [detail]);
  const bodyParams = useMemo(() => {
    const positional = Object.keys(examples.body).filter((k) => /^\d+$/.test(k));
    if (!positional.length) return undefined;
    const highest = Math.max(...positional.map(Number));
    return Array.from({ length: highest }, (_, i) => examples.body[String(i + 1)] ?? '');
  }, [examples]);

  return (
    <DialogShell onClose={onClose} label="Template preview">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]">
              <Eye className="h-5 w-5 text-emerald-600" /> Template preview
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-[var(--text-secondary)]">
                {detail.name}
              </span>
              <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                {detail.language}
              </span>
              <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                {detail.category}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  STATUS_STYLE[detail.status],
                )}
              >
                {detail.status}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <span className={cn('h-2 w-2 rounded-full', QUALITY_DOT[detail.quality])} />
                {detail.quality}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {detail.status === 'REJECTED' && detail.rejectionReason && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="text-xs font-semibold text-red-700">Rejected by Meta</p>
              <p className="mt-0.5 text-xs text-red-600">
                {rejectionHelp(detail.rejectionReason) ?? detail.rejectionReason}
              </p>
              {rejectionHelp(detail.rejectionReason) && (
                <p className="mt-1 font-mono text-[10px] text-red-500">{detail.rejectionReason}</p>
              )}
            </div>
          </div>
        )}

        <TemplatePreviewBubble
          template={detail}
          values={{
            bodyParams,
            bodyNamedParams: examples.body,
            headerText: examples.headerText,
            // Display-only. The bubble otherwise prompts "add a URL" for a media
            // header, which is send-time copy and reads as a fault in a
            // read-only preview — the approved sample lives at Meta as an upload
            // handle, not as a link this page could show.
            ...(analyzeTemplate(detail).headerNeedsMedia
              ? { headerMediaUrl: 'Sample media approved with this template' }
              : {}),
            // Carousel cards, filled with what Meta approved for each of them.
            // Without this the read-only preview would prompt "add an image" per
            // card and report every card variable as still empty — send-time copy
            // on a page that cannot send anything.
            carouselCards: analyzeTemplate(detail).carouselCards.map((card) => ({
              headerMediaUrl: 'Sample approved with this card',
              bodyParams: card.bodyExamples,
            })),
          }}
          note={
            isLoading
              ? 'Loading the full template…'
              : 'Placeholders are filled with the sample values approved with this template.'
          }
        />

        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

function TemplateRow({
  t,
  onAnalytics,
  onEdit,
  onDelete,
  onPreview,
  onAddLanguage,
  onSubmitDraft,
  onRefresh,
  deleting,
  submitting,
  refreshing,
  wabaId,
}: {
  t: WaTemplate;
  onAnalytics: (t: WaTemplate) => void;
  onEdit: (t: WaTemplate) => void;
  onDelete: (t: WaTemplate) => void;
  onPreview: (t: WaTemplate) => void;
  onAddLanguage: (t: WaTemplate) => void;
  onSubmitDraft: (t: WaTemplate) => void;
  /** Re-read THIS row's status from Meta (the header button syncs the WABA). */
  onRefresh: (t: WaTemplate) => void;
  deleting: boolean;
  submitting: boolean;
  refreshing: boolean;
  /** WABA the appeal link points at; null until the channel list loads. */
  wabaId: string | null;
}) {
  // A row that never reached Meta is a local draft: it can be continued and
  // submitted, but it has no Meta-side history to appeal or analyse.
  const isDraft = DRAFT_STATUSES.includes(t.status) && !t.metaId;
  const bodyText =
    (Array.isArray(t.components)
      ? (t.components as Array<{ type?: string; text?: string }>).find(
          (c) => (c.type ?? '').toUpperCase() === 'BODY',
        )?.text
      : '') ?? '';
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Opens the preview: the row shows only the body text, so a media
              header, a footer or the buttons were invisible before sending. */}
          <button
            type="button"
            onClick={() => onPreview(t)}
            title="Preview what the recipient sees"
            className="hover:text-primary font-semibold text-[var(--text)] hover:underline"
          >
            {t.name}
          </button>
          <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {t.language}
          </span>
          <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
            {t.category}
          </span>
        </div>
        {bodyText && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{bodyText}</p>
        )}
        {/* The row shows the explanation; the tooltip keeps Meta's own code in
            reach, because that is what Meta support asks for. */}
        {t.status === 'REJECTED' && t.rejectionReason && (
          <Tooltip
            content={
              rejectionHelp(t.rejectionReason)
                ? `${t.rejectionReason} — ${rejectionHelp(t.rejectionReason)}`
                : t.rejectionReason
            }
          >
            <p className="mt-1 flex items-start gap-1 text-[11px] text-red-600">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              {/* Meta's raw enum meant nothing on its own; the code stays visible
                  next to the explanation because Meta support asks for it. */}
              <span className="line-clamp-1">
                Rejected: {rejectionHelp(t.rejectionReason) ?? t.rejectionReason}
              </span>
            </p>
          </Tooltip>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            STATUS_STYLE[t.status],
          )}
        >
          {t.status}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <span className={cn('h-2 w-2 rounded-full', QUALITY_DOT[t.quality])} /> {t.quality}
        </span>
        <button
          onClick={() => onPreview(t)}
          className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <button
          onClick={() => onEdit(t)}
          className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <Pencil className="h-3.5 w-3.5" /> {isDraft ? 'Continue' : 'Edit'}
        </button>
        {/* A draft has never been submitted, so this is the call that spends the
            template name at Meta — it is deliberately its own action. */}
        {isDraft && (
          <button
            onClick={() => onSubmitDraft(t)}
            disabled={submitting}
            className="flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> Submit for review
          </button>
        )}
        {/* Rolling a template out to another language used to mean re-authoring
            it from scratch, header sample upload included. */}
        <button
          onClick={() => onAddLanguage(t)}
          className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <Languages className="h-3.5 w-3.5" /> Add language
        </button>
        {/* Per-row status re-check. Submitting a template used to mean waiting up
            to six hours for the cron, or re-pulling the entire WABA, to find out
            whether this one row had been approved. */}
        {t.metaId && (
          <button
            onClick={() => onRefresh(t)}
            disabled={refreshing}
            title="Re-check this template's status at Meta"
            className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}{' '}
            Refresh status
          </button>
        )}
        {!isDraft && (
          <button
            onClick={() => onAnalytics(t)}
            className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Analytics
          </button>
        )}
        {/* Meta publishes no appeal endpoint — appeals are raised in Business
            Manager. Editing and resubmitting is usually the faster fix, but when
            the rejection is wrong an appeal is the only route, and it was
            unreachable from here. */}
        {APPEALABLE.includes(t.status) && !isDraft && (
          <a
            href={templateManagerUrl(wabaId)}
            target="_blank"
            rel="noopener noreferrer"
            title="Appeals are raised in Meta’s WhatsApp Manager — Meta exposes no API for them."
            className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Appeal at Meta
          </a>
        )}
        {/* A template name is claimed permanently at Meta, so without a delete a
            typo'd or obsolete template sat in every picker forever. */}
        <button
          onClick={() => onDelete(t)}
          disabled={deleting}
          className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

export default function SuperAdminWhatsappTemplatesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Editing reuses the builder. Meta allows editing APPROVED/REJECTED/PAUSED
  // templates; without it a rejection was terminal, since the name stays reserved.
  const [editing, setEditing] = useState<WaTemplate | null>(null);
  const [analyticsFor, setAnalyticsFor] = useState<WaTemplate | null>(null);
  const [previewFor, setPreviewFor] = useState<WaTemplate | null>(null);
  // "Add language": the builder opens on a NEW template seeded from this one.
  const [cloning, setCloning] = useState<WaTemplate | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  // REJECTED and PAUSED templates are exactly what an operator opens this page to
  // find, and there was no way to filter to them: they were scattered through a
  // paginated list sorted by update time, so on a catalogue of any size the one
  // that needs attention is simply not on screen.
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  // The box stays instant; the QUERY runs on a 300ms-settled value. Bound
  // directly, every keystroke fired a request — each one a `contains` scan over
  // the template catalogue, and the responses landing out of order made the list
  // flicker. The contacts list and the inbox already do this for the same reason.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      // Paging resets with the settled term, not with the keystroke: resetting in
      // the input handler changes the query key on its own, so typing on page 3
      // fires an extra request for the OLD term at page 1.
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-templates', debouncedSearch, categoryFilter, statusFilter, page, limit],
    queryFn: () =>
      svc.listTemplates({
        q: debouncedSearch || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        page,
        limit,
      }),
  });
  // Memoised because the family grouping below derives from it — a fresh []
  // on every render would regroup the whole page for nothing.
  const templates = useMemo(() => data?.data?.items ?? [], [data]);
  /**
   * Rows grouped into template families (same name, different languages).
   *
   * The list rendered a flat row per (name, language), so a template approved in
   * five languages read as five unrelated templates. Grouping is per PAGE — the
   * list is paginated server-side, so a family split across a page boundary is
   * shown as two groups rather than pretending to a completeness this view does
   * not have.
   */
  const families = useMemo(() => {
    const byName = new Map<string, WaTemplate[]>();
    for (const t of templates) {
      const rows = byName.get(t.name);
      if (rows) rows.push(t);
      else byName.set(t.name, [t]);
    }
    return [...byName.entries()];
  }, [templates]);
  // The appeal link has to land on the right WhatsApp Business Account, and the
  // WABA id lives on the channel rows rather than on a template. Shares the
  // settings page's query key, so this is a cache hit in the usual case.
  const { data: channelsData } = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
  });
  const channels = channelsData?.data ?? [];
  const wabaId = (channels.find((c) => c.isDefault) ?? channels[0])?.wabaId || null;
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.ceil(total / limit);

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteTemplate(id),
    onSuccess: () => {
      showToast.success('Template deleted at Meta and here');
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
    },
    // The 409 names the campaign / rule still holding the template, which is the
    // only actionable part of the failure.
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Delete failed'),
  });

  const submitDraftMut = useMutation({
    mutationFn: (id: string) => svc.submitTemplateDraft(id),
    onSuccess: () => {
      showToast.success('Draft submitted to Meta for review');
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
    },
    // The 400 names the structural problem the draft was allowed to be saved
    // with — a missing example, a gap in the placeholder numbering.
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Submit failed'),
  });

  /**
   * Re-check ONE template at Meta.
   *
   * Distinct from the header's "Sync from Meta", which walks the whole WABA:
   * this asks about a single row, which is what an operator wants after
   * submitting one. The toast names the status so the answer is visible without
   * hunting for the row again.
   */
  const refreshMut = useMutation({
    mutationFn: (id: string) => svc.refreshTemplate(id),
    onSuccess: (res) => {
      const tpl = res.data;
      showToast.success(
        tpl ? `${tpl.name} (${tpl.language}) is ${tpl.status}` : 'Template refreshed',
      );
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
      if (tpl) qc.invalidateQueries({ queryKey: ['wa-template', tpl.id] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Refresh failed'),
  });

  const syncMut = useMutation({
    mutationFn: () => svc.syncTemplates(),
    onSuccess: (res) => {
      const missing = res.data?.missing ?? 0;
      showToast.success(
        `Synced ${res.data?.synced ?? 0} templates from Meta` +
          (missing ? ` · ${missing} no longer at Meta were disabled` : ''),
      );
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Sync failed'),
  });

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.templates.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
              <FileText className="h-6 w-6 text-emerald-600" /> WhatsApp Templates
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Approved templates can be sent any time; new templates go to Meta for review.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={
                syncMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
            >
              Sync from Meta
            </Button>
            {/* Meta's library templates are approved instantly, which is the
                fastest route to a working template on a fresh WABA. */}
            <Button
              variant="secondary"
              leftIcon={<BookOpen className="h-4 w-4" />}
              onClick={() => setLibraryOpen(true)}
            >
              Start from library
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New Template
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-9"
            />
          </div>
          <div className="w-48">
            <Select
              value={categoryFilter}
              onChange={(v) => {
                setCategoryFilter(v);
                setPage(1);
              }}
              options={[{ value: '', label: 'All categories' }, ...CATEGORY_OPTIONS]}
            />
          </div>
          <div className="w-48">
            <Select
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              options={[
                { value: '', label: 'All statuses' },
                ...Object.keys(STATUS_STYLE).map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!isLoading && templates.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              No templates yet. Click <strong>Sync from Meta</strong> to pull existing ones, or
              create a new one.
            </p>
          )}
          {families.map(([name, rows]) => (
            <div key={name}>
              {/* Only a real family gets a header — a single-language template
                  would just repeat its own name. */}
              {rows.length > 1 && (
                <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-1.5">
                  <Languages className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">{name}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                    {rows.length} languages
                  </span>
                </div>
              )}
              {rows.map((t) => (
                <TemplateRow
                  key={t.id}
                  t={t}
                  onAnalytics={setAnalyticsFor}
                  onEdit={setEditing}
                  onPreview={setPreviewFor}
                  onAddLanguage={setCloning}
                  onSubmitDraft={(tpl) => submitDraftMut.mutate(tpl.id)}
                  onRefresh={(tpl) => refreshMut.mutate(tpl.id)}
                  deleting={deleteMut.isPending}
                  submitting={submitDraftMut.isPending}
                  refreshing={refreshMut.isPending && refreshMut.variables === t.id}
                  wabaId={wabaId}
                  onDelete={(tpl) => {
                    if (
                      window.confirm(
                        tpl.metaId
                          ? `Delete "${tpl.name}" (${tpl.language})? This removes it at Meta too and cannot be undone.`
                          : `Delete the draft "${tpl.name}" (${tpl.language})? It was never submitted, so nothing changes at Meta.`,
                      )
                    ) {
                      deleteMut.mutate(tpl.id);
                    }
                  }}
                />
              ))}
            </div>
          ))}
          {!isLoading && total > 0 && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={total}
                pageSize={limit}
                onPageSizeChange={(s) => {
                  setLimit(s);
                  setPage(1);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {creating && <TemplateBuilder onClose={() => setCreating(false)} />}
      {editing && <TemplateBuilder template={editing} onClose={() => setEditing(null)} />}
      {cloning && <TemplateBuilder cloneFrom={cloning} onClose={() => setCloning(null)} />}
      {libraryOpen && <TemplateLibraryModal onClose={() => setLibraryOpen(false)} />}
      {previewFor && (
        <TemplateDetailDrawer template={previewFor} onClose={() => setPreviewFor(null)} />
      )}
      {analyticsFor && (
        <TemplateAnalyticsModal template={analyticsFor} onClose={() => setAnalyticsFor(null)} />
      )}
    </DashboardLayout>
  );
}
