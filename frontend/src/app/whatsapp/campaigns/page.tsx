'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Send, Plus, Trash2, Archive, Search, X } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CampaignTemplatesSection from '@/components/whatsapp/CampaignTemplatesSection';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import Pagination from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { CAMPAIGN_STATUS_STYLE } from '@/components/whatsapp/campaign-status-style';
import type { WaCampaign } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

// Build marker: WhatsApp release image rebuild (2026-06-29)

/** Status filter options, in the order a campaign moves through them. */
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function SuperAdminWhatsappCampaignsPage() {
  const qc = useQueryClient();
  const { socket } = useSocket();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  // Archived campaigns are hidden by default — that is the point of archiving —
  // but they have to stay reachable, so the list can show them on request.
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState('');
  // The input stays instant; the query runs on a settled value, so typing a name
  // does not fire a request per keystroke.
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wa-campaigns', page, limit, showArchived, status, q],
    queryFn: () =>
      svc.listCampaigns({
        page,
        limit,
        archived: showArchived || undefined,
        status: status || undefined,
        q: q || undefined,
      }),
    refetchInterval: 30_000,
  });
  const campaigns = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.ceil(total / limit);
  const filtersActive = !!status || !!search;

  // Live progress: the backend emits `wa:campaign` on every counter change.
  // Invalidate the list so each row's progress bar updates without waiting
  // for the 30s poll (which stays as a fallback if the socket is down).
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    };
    socket.on('wa:campaign', handler);
    return () => {
      socket.off('wa:campaign', handler);
    };
  }, [socket, qc]);

  // A DRAFT has no history worth keeping, so it is deleted for real (the schema
  // cascades its recipients, steps and variants). Anything that has already sent
  // is archived instead: analytics and conversions still reference it.
  const removeMut = useMutation({
    mutationFn: (id: string) => svc.deleteCampaign(id),
    onSuccess: (res) => {
      showToast.success(res.data?.archived ? 'Campaign archived' : 'Campaign deleted');
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Could not remove'),
  });

  const confirmRemove = async (c: WaCampaign) => {
    const archives = c.status !== 'DRAFT';
    const ok = await confirmDialog({
      title: archives ? `Archive "${c.name}"?` : `Delete "${c.name}"?`,
      message: archives
        ? 'It leaves this list but keeps its recipients and reporting, and any recurrence is turned off. Tick “Show archived” to find it again.'
        : 'This draft and everything configured on it — audience, steps, variants — are deleted permanently.',
      confirmLabel: archives ? 'Archive' : 'Delete',
      variant: 'danger',
    });
    if (ok) removeMut.mutate(c.id);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.campaigns.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Send className="h-6 w-6 text-emerald-600" /> Campaigns
          </h1>
          <div className="flex items-center gap-4">
            <Switch
              label="Show archived"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                setPage(1);
              }}
            />
            <Link href={ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_NEW}>
              <Button leftIcon={<Plus className="h-4 w-4" />}>New campaign</Button>
            </Link>
          </div>
        </div>

        <CampaignTemplatesSection />

        {/* Filters. Without them the page is an append-only log — after a year of
            weekly broadcasts, "which campaign is running right now" meant paging
            through hundreds of completed rows. */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-white p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <Input
              aria-label="Search campaigns by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="pl-9"
            />
          </div>
          <div className="w-48">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              clearable={false}
            />
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setQ('');
                setStatus('');
                setPage(1);
              }}
              className="text-primary inline-flex h-10 items-center gap-1 text-xs hover:underline"
            >
              <X className="h-3 w-3" aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {/* A failed request must not render as "no campaigns yet" — that reads
              as "nothing to see", on a page whose whole job is showing what is
              running right now. */}
          {!isLoading && isError && (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--error)]">Could not load campaigns.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!isLoading && !isError && campaigns.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              {filtersActive
                ? 'No campaigns match these filters.'
                : 'No campaigns yet. Create one to send an approved template to an audience.'}
            </p>
          )}
          {campaigns.map((c) => {
            const done = c.sentCount + c.failedCount + c.skippedCount;
            const pct = c.totalRecipients ? Math.round((done / c.totalRecipients) * 100) : 0;
            const archived = !!c.archivedAt;
            // RUNNING / PAUSED / SCHEDULED campaigns are refused by the API — stop
            // one first, so the operator sees what they are stopping.
            const removable =
              c.status === 'DRAFT' || c.status === 'CANCELLED' || c.status === 'COMPLETED';
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 hover:bg-[var(--bg-secondary)]"
              >
                <Link
                  href={ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_DETAIL(c.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-[var(--text)]">{c.name}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          CAMPAIGN_STATUS_STYLE[c.status],
                        )}
                      >
                        {c.status}
                      </span>
                      <Badge variant={c.type === 'SEQUENCE' ? 'accent' : 'info'} size="sm">
                        {c.type === 'SEQUENCE' ? 'SEQUENCE' : 'BROADCAST'}
                      </Badge>
                      {archived && (
                        <Badge variant="neutral" size="sm">
                          ARCHIVED
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {c.template?.name ?? '—'} · {c.totalRecipients} recipients
                    </p>
                  </div>
                  <div className="w-32 shrink-0">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">
                      {c.sentCount} sent · {c.readCount} read
                    </p>
                  </div>
                </Link>
                {removable && !archived && (
                  <button
                    type="button"
                    onClick={() => void confirmRemove(c)}
                    disabled={removeMut.isPending}
                    aria-label={c.status === 'DRAFT' ? `Delete ${c.name}` : `Archive ${c.name}`}
                    title={c.status === 'DRAFT' ? 'Delete draft' : 'Archive campaign'}
                    className="shrink-0 rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--error)] disabled:opacity-40"
                  >
                    {c.status === 'DRAFT' ? (
                      <Trash2 className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
          {!isLoading && campaigns.length > 0 && (
            <div className="px-4 py-3">
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
    </DashboardLayout>
  );
}
