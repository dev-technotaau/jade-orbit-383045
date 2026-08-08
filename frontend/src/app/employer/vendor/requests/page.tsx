'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Building2, CheckCircle2, Send, ExternalLink, MessageSquareReply } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Pagination from '@/components/ui/Pagination';
import { vendorService, type VendorLeadStatus } from '@/services/vendor.service';
import { ROUTES } from '@/constants/routes';

/**
 * Employer-side "requests sent to recruitment partners" view — the
 * return leg of the employer→vendor round-trip. Lists the hiring
 * requirements this employer sent to vendors and surfaces each vendor's
 * response. No plan gate: any employer can send requests, so any
 * employer can review them here.
 */

const STATUS_TABS: { value: VendorLeadStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'RESPONDED', label: 'Responded' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'EXPIRED', label: 'Expired' },
];

const STATUS_VARIANT: Record<
  VendorLeadStatus,
  'warning' | 'info' | 'success' | 'error' | 'neutral'
> = {
  PENDING: 'warning',
  RESPONDED: 'info',
  ACCEPTED: 'success',
  DECLINED: 'error',
  EXPIRED: 'neutral',
};

const STATUS_LABEL: Record<VendorLeadStatus, string> = {
  PENDING: 'Pending',
  RESPONDED: 'Responded',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function VendorRequestsPage() {
  const [status, setStatus] = useState<VendorLeadStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor', 'sent-leads', status ?? 'ALL', page, pageSize],
    queryFn: () => vendorService.listSentLeads({ status, page, limit: pageSize }),
    placeholderData: keepPreviousData,
  });

  const counts = data?.counts ?? {};
  const totalCount = Object.values(counts).reduce((sum, n) => sum + n, 0);

  function selectTab(value: VendorLeadStatus | 'ALL') {
    setStatus(value === 'ALL' ? undefined : value);
    setPage(1);
  }

  const activeTab: VendorLeadStatus | 'ALL' = status ?? 'ALL';

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Requests to recruitment partners
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Hiring requirements you sent to recruitment partners (vendors) — track which ones they
            accepted, declined, or replied to.
          </p>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const count = tab.value === 'ALL' ? totalCount : (counts[tab.value] ?? 0);
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => selectTab(tab.value)}
                className={
                  activeTab === tab.value
                    ? 'bg-primary rounded-full px-4 py-1.5 text-sm font-medium text-white'
                    : 'rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                }
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-80">{count}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <Card padding="lg" className="text-center">
            <Send className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
            <p className="mt-3 font-medium text-[var(--text)]">
              You haven&apos;t sent any requests yet
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Browse our recruitment partners and send them your hiring requirements to get started.
            </p>
            <Link href={ROUTES.VENDORS_PUBLIC.LIST} className="mt-4 inline-block">
              <Button variant="primary">Browse recruitment partners</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {data?.items.map((lead) => {
              const vendor = lead.vendorProfile;
              return (
                <Card key={lead.id} padding="lg">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* Vendor identity */}
                    <div className="flex min-w-0 items-center gap-3">
                      {vendor?.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={vendor.logo}
                          alt={vendor.businessName}
                          className="h-10 w-10 flex-none rounded-lg object-contain"
                        />
                      ) : (
                        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                          <Building2 className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {vendor ? (
                            <Link
                              href={ROUTES.VENDORS_PUBLIC.DETAIL(vendor.slug)}
                              className="text-primary truncate font-semibold hover:underline"
                            >
                              {vendor.businessName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-[var(--text)]">
                              Recruitment partner
                            </span>
                          )}
                          {vendor?.isVerified && (
                            <Badge variant="success" className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Verified
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          Sent {formatDate(lead.createdAt)}
                        </p>
                      </div>
                    </div>

                    <Badge variant={STATUS_VARIANT[lead.status]} className="shrink-0">
                      {STATUS_LABEL[lead.status]}
                    </Badge>
                  </div>

                  {/* Your request */}
                  <div className="mt-4">
                    <p className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                      Your request
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
                      {lead.requirementText}
                    </p>
                    {lead.jobPost && (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        For:{' '}
                        <Link
                          href={ROUTES.PUBLIC.JOB_DETAIL(lead.jobPost.slug)}
                          target="_blank"
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          {lead.jobPost.title} <ExternalLink className="h-3 w-3" />
                        </Link>
                      </p>
                    )}
                  </div>

                  {/* Vendor response */}
                  {lead.responseText && (
                    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                        <MessageSquareReply className="h-3.5 w-3.5" /> Vendor response
                      </p>
                      <p className="mt-1.5 text-sm whitespace-pre-wrap text-[var(--text)]">
                        {lead.responseText}
                      </p>
                      {lead.respondedAt && (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Replied {formatDate(lead.respondedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}

            <Pagination
              currentPage={page}
              totalPages={data?.pagination.pages ?? 1}
              onPageChange={setPage}
              totalItems={data?.pagination.total}
              pageSize={pageSize}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
