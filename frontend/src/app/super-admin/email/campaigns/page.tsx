'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Send,
  Plus,
  Layers,
  Search,
  Pause,
  Play,
  Ban,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import type { EmailCampaignStatus } from '@/types/email';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { handleBulkResult } from '@/lib/email-bulk';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import { EMAIL_CAMPAIGN_STATUS_STYLE } from '@/components/super-admin/email/email-status-style';

const CAMPAIGN_STATUSES: EmailCampaignStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'QUEUED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
];

export default function SuperAdminEmailCampaignsPage() {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const [status, setStatus] = useState<EmailCampaignStatus | ''>('');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(30);
  const sel = useBulkSelect();
  const [confirmAction, setConfirmAction] = useState<null | 'delete' | 'cancel'>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['email-campaigns', status, q, showArchived, page, limit],
    queryFn: () =>
      svc.listCampaigns({
        status: status || undefined,
        q: q || undefined,
        archived: showArchived || undefined,
        page,
        limit,
      }),
    refetchInterval: 30_000,
  });
  const campaigns = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.ceil(total / limit);
  const pageIds = campaigns.map((c) => c.id);

  async function runBulk(
    action: 'pause' | 'resume' | 'cancel' | 'duplicate' | 'archive' | 'unarchive' | 'delete',
  ) {
    try {
      const res = await svc.bulkCampaigns(sel.ids, action);
      const labels: Record<typeof action, string> = {
        delete: 'Deleted campaigns',
        pause: 'Paused',
        cancel: 'Cancelled',
        resume: 'Resumed',
        duplicate: 'Duplicated',
        archive: 'Archived',
        unarchive: 'Unarchived',
      };
      handleBulkResult(res.data, { qc, label: labels[action] ?? 'Campaigns updated' });
      qc.invalidateQueries({ queryKey: ['email-campaigns'] });
      sel.clear();
    } catch {
      showToast.error('Bulk action failed');
    } finally {
      setConfirmAction(null);
    }
  }

  const { data: bpData } = useQuery({
    queryKey: ['email-blueprints'],
    queryFn: () => svc.listBlueprints(),
  });
  const blueprints = bpData?.data ?? [];

  useEffect(() => {
    if (!socket) return;
    const handler = () => qc.invalidateQueries({ queryKey: ['email-campaigns'] });
    socket.on('email:campaign', handler);
    return () => {
      socket.off('email:campaign', handler);
    };
  }, [socket, qc]);

  async function applyBlueprint(id: string) {
    try {
      const res = await svc.useBlueprint(id);
      showToast.success('Campaign created from blueprint');
      const cid = res.data?.id;
      if (cid) window.location.href = ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGN_DETAIL(cid);
      else qc.invalidateQueries({ queryKey: ['email-campaigns'] });
    } catch {
      showToast.error('Could not create campaign from blueprint');
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.campaigns.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Send className="h-6 w-6 text-blue-600" /> Email Campaigns
          </h1>
          <Link href={ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGN_NEW}>
            <Button leftIcon={<Plus className="h-4 w-4" />}>New campaign</Button>
          </Link>
        </div>

        {blueprints.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Layers className="h-4 w-4 text-[var(--text-muted)]" /> Saved blueprints
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {blueprints.map((bp) => (
                <div key={bp.id} className="rounded-lg border border-[var(--border)] p-3">
                  <p className="truncate font-medium text-[var(--text)]">{bp.name}</p>
                  <p className="mb-2 text-xs text-[var(--text-muted)]">{bp.type}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => applyBlueprint(bp.id)}>
                      Use
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await svc.deleteBlueprint(bp.id);
                        qc.invalidateQueries({ queryKey: ['email-blueprints'] });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <Input
              inputSize="sm"
              leftIcon={<Search className="h-4 w-4" />}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search campaigns…"
            />
          </div>
          <div className="w-44">
            <Select
              options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: s }))}
              value={status}
              onChange={(v) => {
                setStatus(v as EmailCampaignStatus | '');
                setPage(1);
              }}
              placeholder="All statuses"
              size="sm"
            />
          </div>
          <Button
            size="sm"
            variant={showArchived ? 'primary' : 'secondary'}
            leftIcon={<Archive className="h-4 w-4" />}
            onClick={() => {
              setShowArchived((v) => !v);
              setPage(1);
              sel.clear();
            }}
          >
            Archived
          </Button>
        </div>

        {sel.active && (
          <BulkBar
            count={sel.count}
            allMatching={false}
            totalMatching={total}
            allOnPage={sel.allOnPage(pageIds)}
            entity="campaigns"
            onSelectAllMatching={sel.selectAllMatching}
            onClear={sel.clear}
            allowSelectAll={false}
          >
            <BulkButton icon={Pause} onClick={() => runBulk('pause')}>
              Pause
            </BulkButton>
            <BulkButton icon={Play} onClick={() => runBulk('resume')}>
              Resume
            </BulkButton>
            <BulkButton icon={Ban} danger onClick={() => setConfirmAction('cancel')}>
              Cancel
            </BulkButton>
            <BulkButton icon={Copy} onClick={() => runBulk('duplicate')}>
              Duplicate
            </BulkButton>
            {showArchived ? (
              <BulkButton icon={ArchiveRestore} onClick={() => runBulk('unarchive')}>
                Unarchive
              </BulkButton>
            ) : (
              <BulkButton icon={Archive} onClick={() => runBulk('archive')}>
                Archive
              </BulkButton>
            )}
            <BulkButton icon={Trash2} danger onClick={() => setConfirmAction('delete')}>
              Delete
            </BulkButton>
          </BulkBar>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {campaigns.length > 0 && (
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
              <HeaderCheckbox
                checked={sel.allOnPage(pageIds)}
                indeterminate={sel.someOnPage(pageIds)}
                onChange={(on) => sel.setPage(pageIds, on)}
                title="Select page"
              />
              <span>Campaign</span>
            </div>
          )}
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!isLoading && campaigns.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              No campaigns yet. Create one to send a template to an audience.
            </p>
          )}
          {campaigns.map((c) => {
            const done = c.sentCount + c.failedCount + c.skippedCount;
            const pct = c.totalRecipients ? Math.round((done / c.totalRecipients) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={ROUTES.SUPER_ADMIN.EMAIL_CAMPAIGN_DETAIL(c.id)}
                className="block border-b border-[var(--border)] px-4 py-3 hover:bg-[var(--bg-secondary)]"
              >
                <div className="flex items-center gap-3">
                  <RowCheckbox
                    checked={sel.isSelected(c.id)}
                    onChange={() => {}}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      sel.toggle(c.id);
                    }}
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-[var(--text)]">{c.name}</span>
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
                        {c.isAbTest && (
                          <Badge variant="warning" size="sm">
                            A/B
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {c.template?.name ?? '—'} · {c.totalRecipients} recipients · {c.openedCount}{' '}
                        opens · {c.clickedCount} clicks
                      </p>
                    </div>
                    <div className="w-32 shrink-0">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">{pct}%</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

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

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction) runBulk(confirmAction);
        }}
        title={confirmAction === 'delete' ? 'Delete campaigns' : 'Cancel campaigns'}
        message={
          confirmAction === 'delete'
            ? `Permanently delete ${sel.count} campaign${sel.count === 1 ? '' : 's'}? This cannot be undone.`
            : `Cancel ${sel.count} campaign${sel.count === 1 ? '' : 's'}? In-progress sends will stop.`
        }
        confirmLabel={confirmAction === 'delete' ? 'Delete' : 'Cancel campaigns'}
      />
    </DashboardLayout>
  );
}
