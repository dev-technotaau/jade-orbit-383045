'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  CheckCircle,
  XCircle,
  Send,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Crown,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Spinner from '@/components/ui/Spinner';
import Tabs from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import { vendorService, type VendorLead, type VendorLeadStatus } from '@/services/vendor.service';
import { useEntitlements } from '@/hooks/use-entitlements';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

const TABS: { key: VendorLeadStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'RESPONDED', label: 'Responded' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'DECLINED', label: 'Declined' },
];

export default function VendorLeadsPage() {
  const queryClient = useQueryClient();
  const { hasFeature, isLoading: entLoading } = useEntitlements();
  const hasAccess = hasFeature('feature.vendor_leads');
  const [filter, setFilter] = useState<VendorLeadStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [responding, setResponding] = useState<VendorLead | null>(null);
  const [responseText, setResponseText] = useState('');
  const [pendingAction, setPendingAction] = useState<'RESPONDED' | 'ACCEPTED' | 'DECLINED' | null>(
    null,
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vendor', 'leads', filter, page, limit],
    queryFn: () =>
      vendorService.listMyLeads({
        status: filter === 'ALL' ? undefined : filter,
        page,
        limit,
      }),
    enabled: hasAccess,
    // The endpoint 404s until a vendor profile exists ("Set up your vendor
    // profile first") — that's an expected state, not a transient error,
    // so don't retry it.
    retry: false,
  });
  // No vendor profile yet → the backend 404s; surface a setup prompt
  // instead of a blank page.
  const needsProfile = hasAccess && isError;

  const respond = useMutation({
    mutationFn: (input: {
      leadId: string;
      status: 'RESPONDED' | 'ACCEPTED' | 'DECLINED';
      responseText?: string;
    }) => vendorService.respondToLead(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'leads'] });
      setResponding(null);
      setResponseText('');
      setPendingAction(null);
      showToast.success('Response sent');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to respond');
    },
  });

  function handleSubmitResponse() {
    if (!responding || !pendingAction) return;
    respond.mutate({
      leadId: responding.id,
      status: pendingAction,
      responseText: responseText.trim() || undefined,
    });
  }

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Lead inbox</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Hiring requirements employers have routed to your business.
          </p>
        </div>

        {!entLoading && !hasAccess ? (
          <Card padding="lg" className="border-blue-200 bg-blue-50/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-blue-900">
                    Vendor Connect subscription required
                  </h2>
                  <p className="mt-1 text-sm text-blue-800">
                    Subscribe to Hire Adda Vendor Connect (₹199/month) to receive hiring
                    requirements from companies in your lead inbox.
                  </p>
                </div>
              </div>
              <Link href="/billing/checkout/VENDOR_CONNECT">
                <Button variant="primary">Subscribe</Button>
              </Link>
            </div>
          </Card>
        ) : needsProfile ? (
          <Card padding="lg" className="border-amber-200 bg-amber-50/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-amber-500 text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-amber-900">Set up your vendor profile first</h2>
                  <p className="mt-1 text-sm text-amber-800">
                    Complete and publish your vendor profile so employers can discover you in the
                    directory and route hiring requirements to your inbox.
                  </p>
                </div>
              </div>
              <Link href={ROUTES.EMPLOYER.VENDOR_PROFILE}>
                <Button variant="primary">Set up profile</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <Tabs
              tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
              activeTab={filter}
              onChange={(k) => {
                setFilter(k as VendorLeadStatus | 'ALL');
                setPage(1);
              }}
            />

            {isLoading && (
              <Card padding="lg" className="flex items-center justify-center">
                <Spinner />
              </Card>
            )}
            {!isLoading && data && data.items.length === 0 && (
              <Card padding="lg">
                <EmptyState
                  icon={Inbox}
                  title="No leads here"
                  description="Make sure your profile is public and complete so employers can find you in the directory."
                />
              </Card>
            )}
            {!isLoading && data && data.items.length > 0 && (
              <div className="space-y-3">
                {data.items.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onRespond={() => {
                      setResponding(lead);
                      setResponseText(lead.responseText ?? '');
                    }}
                  />
                ))}
                {data.pagination.pages > 1 && (
                  <Pagination
                    currentPage={page}
                    totalPages={data.pagination.pages}
                    onPageChange={setPage}
                    totalItems={data.pagination.total}
                    pageSize={limit}
                    onPageSizeChange={(s) => {
                      setLimit(s);
                      setPage(1);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {responding && (
        <Modal
          isOpen
          onClose={() => {
            setResponding(null);
            setPendingAction(null);
            setResponseText('');
          }}
          title="Respond to lead"
          size="md"
        >
          <div className="space-y-4">
            <Card padding="md" className="bg-[var(--bg-secondary)]">
              <p className="text-sm text-[var(--text)]">{responding.requirementText}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                From {responding.employer?.firstName ?? 'Employer'} ·{' '}
                {new Date(responding.createdAt).toLocaleString('en-IN')}
              </p>
            </Card>
            <Textarea
              label="Your response (optional)"
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={4}
              placeholder="Tell the employer what you can do for them. They'll see this in their inbox."
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setPendingAction('DECLINED')}
                isLoading={respond.isPending && pendingAction === 'DECLINED'}
              >
                <XCircle className="mr-1.5 h-4 w-4" /> Decline
              </Button>
              <Button
                variant="outline"
                onClick={() => setPendingAction('RESPONDED')}
                isLoading={respond.isPending && pendingAction === 'RESPONDED'}
              >
                <Send className="mr-1.5 h-4 w-4" /> Send response
              </Button>
              <Button
                variant="primary"
                onClick={() => setPendingAction('ACCEPTED')}
                isLoading={respond.isPending && pendingAction === 'ACCEPTED'}
              >
                <CheckCircle className="mr-1.5 h-4 w-4" /> Accept
              </Button>
            </div>
            {pendingAction && (
              <div className="border-t border-[var(--border)] pt-3 text-right">
                <Button
                  variant="primary"
                  onClick={handleSubmitResponse}
                  isLoading={respond.isPending}
                >
                  Confirm — {pendingAction.toLowerCase()}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}

function LeadCard({ lead, onRespond }: { lead: VendorLead; onRespond: () => void }) {
  return (
    <Card padding="md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge
              variant={
                lead.status === 'PENDING'
                  ? 'warning'
                  : lead.status === 'ACCEPTED'
                    ? 'success'
                    : lead.status === 'DECLINED'
                      ? 'error'
                      : 'neutral'
              }
            >
              {lead.status.toLowerCase()}
            </Badge>
            <span className="text-xs text-[var(--text-muted)]">
              {new Date(lead.createdAt).toLocaleString('en-IN')}
            </span>
          </div>
          {lead.jobPost && (
            <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--text)]">
              <Briefcase className="h-4 w-4" /> {lead.jobPost.title}
              {lead.jobPost.location && (
                <span className="text-[var(--text-muted)]">· {lead.jobPost.location}</span>
              )}
            </p>
          )}
          <p className="mt-2 text-sm text-[var(--text)]">{lead.requirementText}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
            {lead.contactEmail && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {lead.contactEmail}
              </span>
            )}
            {lead.contactPhone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {lead.contactPhone}
              </span>
            )}
          </div>
          {lead.responseText && (
            <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-xs text-[var(--text-secondary)] italic">
              Your response: {lead.responseText}
            </p>
          )}
        </div>
        {lead.status === 'PENDING' && (
          <Button variant="primary" size="sm" onClick={onRespond}>
            Respond
          </Button>
        )}
      </div>
    </Card>
  );
}
