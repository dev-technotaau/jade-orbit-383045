'use client';

import { useState } from 'react';
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-template-analytics', template.id],
    queryFn: () => svc.getTemplateAnalytics(template.id),
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
              <p className="mt-0.5 text-xs text-red-600">{rejectionReason}</p>
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

        {!isLoading && a && (
          <div className="space-y-4">
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

function TemplateRow({ t, onAnalytics }: { t: WaTemplate; onAnalytics: (t: WaTemplate) => void }) {
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
          <span className="font-semibold text-[var(--text)]">{t.name}</span>
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
        {t.status === 'REJECTED' && t.rejectionReason && (
          <Tooltip content={t.rejectionReason}>
            <p className="mt-1 flex items-start gap-1 text-[11px] text-red-600">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span className="line-clamp-1">Rejected: {t.rejectionReason}</span>
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
          onClick={() => onAnalytics(t)}
          className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <BarChart3 className="h-3.5 w-3.5" /> Analytics
        </button>
      </div>
    </div>
  );
}

export default function SuperAdminWhatsappTemplatesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [analyticsFor, setAnalyticsFor] = useState<WaTemplate | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-templates', search, categoryFilter, page, limit],
    queryFn: () =>
      svc.listTemplates({
        q: search || undefined,
        category: categoryFilter || undefined,
        page,
        limit,
      }),
  });
  const templates = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.ceil(total / limit);

  const syncMut = useMutation({
    mutationFn: () => svc.syncTemplates(),
    onSuccess: (res) => {
      showToast.success(`Synced ${res.data?.synced ?? 0} templates from Meta`);
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
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
          {templates.map((t) => (
            <TemplateRow key={t.id} t={t} onAnalytics={setAnalyticsFor} />
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
      {analyticsFor && (
        <TemplateAnalyticsModal template={analyticsFor} onClose={() => setAnalyticsFor(null)} />
      )}
    </DashboardLayout>
  );
}
