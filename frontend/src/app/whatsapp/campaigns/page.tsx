'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Send, Plus } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CampaignTemplatesSection from '@/components/whatsapp/CampaignTemplatesSection';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { CAMPAIGN_STATUS_STYLE } from '@/components/whatsapp/campaign-status-style';

// Build marker: WhatsApp release image rebuild (2026-06-29)

export default function SuperAdminWhatsappCampaignsPage() {
  const qc = useQueryClient();
  const { socket } = useSocket();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-campaigns', page, limit],
    queryFn: () => svc.listCampaigns({ page, limit }),
    refetchInterval: 30_000,
  });
  const campaigns = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.ceil(total / limit);

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
          <Link href={ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_NEW}>
            <Button leftIcon={<Plus className="h-4 w-4" />}>New campaign</Button>
          </Link>
        </div>

        <CampaignTemplatesSection />

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!isLoading && campaigns.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              No campaigns yet. Create one to send an approved template to an audience.
            </p>
          )}
          {campaigns.map((c) => {
            const done = c.sentCount + c.failedCount + c.skippedCount;
            const pct = c.totalRecipients ? Math.round((done / c.totalRecipients) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_DETAIL(c.id)}
                className="block border-b border-[var(--border)] px-4 py-3 hover:bg-[var(--bg-secondary)]"
              >
                <div className="flex items-center justify-between gap-3">
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
                </div>
              </Link>
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
