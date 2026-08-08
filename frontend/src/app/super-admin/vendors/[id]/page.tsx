'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  BadgeCheck,
  Eye,
  EyeOff,
  Star,
  Trash2,
  Mail,
  Phone,
  Globe,
  CheckCircle,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import { promptDialog } from '@/components/ui/dialog-service';
import Button from '@/components/ui/Button';
import Switch from '@/components/ui/Switch';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { superAdminVendorsService } from '@/services/super-admin-vendors.service';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

export default function SuperAdminVendorDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'vendors', id],
    queryFn: () => superAdminVendorsService.detail(id),
    enabled: Boolean(id),
  });

  const verifyToggle = useMutation({
    mutationFn: (next: boolean) => superAdminVendorsService.setVerified(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'vendors', id] });
      showToast.success('Verification updated');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed');
    },
  });

  const visibilityToggle = useMutation({
    mutationFn: ({ next, reason }: { next: boolean; reason?: string }) =>
      superAdminVendorsService.setVisibility(id, next, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'vendors', id] });
      showToast.success('Visibility updated');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed');
    },
  });

  const deleteReview = useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason: string }) =>
      superAdminVendorsService.deleteReview(reviewId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'vendors', id] });
      showToast.success('Review deleted');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed');
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="vendors.view">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="vendors.view">
        <Card padding="lg">
          <p className="text-sm text-[var(--text-muted)]">Vendor not found.</p>
          <Link
            href="/super-admin/vendors"
            className="text-primary mt-3 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to vendors
          </Link>
        </Card>
      </DashboardLayout>
    );
  }

  const {
    vendor,
    leads,
    reviews,
    leadCounts,
    ratingStats,
    activeSubscription,
    contactReveals,
    revealCount,
    savedCount,
    leadsRedacted,
    reviewsRedacted,
  } = data;

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="vendors.view">
      <div className="space-y-6">
        <Link
          href="/super-admin/vendors"
          className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to vendors
        </Link>

        {/* Identity + actions */}
        <Card padding="lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
                {vendor.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={vendor.logo}
                    alt={vendor.businessName}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
                )}
              </div>
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
                  {vendor.businessName}
                  {vendor.isVerified && (
                    <BadgeCheck className="h-5 w-5 text-blue-600" aria-label="Verified" />
                  )}
                </h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Owner: {vendor.user.email} · slug <span className="font-mono">{vendor.slug}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {vendor.contactEmail}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {vendor.contactPhone}
                  </span>
                  {vendor.website && (
                    <a
                      href={vendor.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" /> Website
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2">
                <BadgeCheck className="h-4 w-4 text-blue-600" />
                <span className="text-sm">Verified</span>
                <Switch
                  checked={vendor.isVerified}
                  onChange={(e) => verifyToggle.mutate(e.target.checked)}
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2">
                {vendor.isPublic ? (
                  <Eye className="h-4 w-4 text-emerald-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-amber-600" />
                )}
                <span className="text-sm">Public</span>
                <Switch
                  checked={vendor.isPublic}
                  onChange={async (e) => {
                    const nextPublic = e.target.checked;
                    const reason = nextPublic
                      ? undefined
                      : ((await promptDialog({
                          title: 'Hide vendor',
                          label: 'Reason for force-hiding this vendor (optional, audit log):',
                          defaultValue: '',
                        })) ?? undefined);
                    visibilityToggle.mutate({ next: nextPublic, reason });
                  }}
                />
              </div>
            </div>
          </div>
          {!activeSubscription && (
            <div className="mt-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                No active VENDOR_CONNECT subscription
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/80">
                This vendor won&apos;t appear in the public directory regardless of their{' '}
                <code>isPublic</code> flag — listing requires <code>feature.vendor_listing</code>.
              </p>
            </div>
          )}
          {activeSubscription && (
            <div className="mt-4 rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm dark:bg-emerald-900/20">
              <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                Subscribed: {activeSubscription.plan.name}
              </p>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200/80">
                Valid until {new Date(activeSubscription.validUntil).toLocaleDateString('en-IN')}
              </p>
            </div>
          )}
        </Card>

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Pending leads" value={leadCounts.PENDING ?? 0} />
          <StatCard label="Responded" value={leadCounts.RESPONDED ?? 0} />
          <StatCard label="Accepted" value={leadCounts.ACCEPTED ?? 0} />
          <StatCard
            label="Avg rating"
            value={
              ratingStats.avg != null ? `${ratingStats.avg.toFixed(1)} (${ratingStats.count})` : '—'
            }
          />
        </div>

        {/* Leads */}
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text)]">Recent leads</h2>
          {leadsRedacted ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              This vendor has leads, but they name the employers who sent them — viewing that needs
              the vendor leads permission.
            </p>
          ) : leads.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">No leads received.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {leads.map((lead) => (
                <li key={lead.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-[var(--text)]">
                        {lead.requirementText}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {new Date(lead.createdAt).toLocaleString('en-IN')}
                        {lead.jobPost ? ` · Job: ${lead.jobPost.title}` : ' · Direct'}
                        {lead.employer ? ` · From ${lead.employer.email}` : ''}
                      </p>
                    </div>
                    <Badge
                      variant={
                        lead.status === 'PENDING'
                          ? 'warning'
                          : lead.status === 'ACCEPTED'
                            ? 'success'
                            : lead.status === 'DECLINED' || lead.status === 'EXPIRED'
                              ? 'error'
                              : 'neutral'
                      }
                    >
                      {lead.status.toLowerCase()}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Job board activity */}
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text)]">Job board activity</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-xs tracking-wider text-[var(--text-muted)] uppercase">
                Employer contacts revealed
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--text)]">{revealCount}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-xs tracking-wider text-[var(--text-muted)] uppercase">
                Postings saved
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--text)]">{savedCount}</p>
            </div>
          </div>
          {revealCount === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              No employer contacts revealed yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {contactReveals.map((reveal, i) => (
                <li key={`${reveal.jobPostId ?? 'na'}-${i}`} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {reveal.jobSlug ? (
                        <Link
                          href={ROUTES.PUBLIC.JOB_DETAIL(reveal.jobSlug)}
                          className="text-primary text-sm font-medium hover:underline"
                        >
                          {reveal.jobTitle ?? 'Untitled posting'}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium text-[var(--text)]">
                          {reveal.jobTitle ?? 'Untitled posting'}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {reveal.companyName ?? '—'}
                      </p>
                    </div>
                    <span className="flex-none text-xs text-[var(--text-muted)]">
                      {new Date(reveal.revealedAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Reviews + moderation */}
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text)]">Reviews</h2>
          {reviewsRedacted ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              This vendor has reviews, but they name their authors — viewing that needs the vendor
              reviews permission.
            </p>
          ) : reviews.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">No reviews submitted.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {[r.reviewer?.firstName, r.reviewer?.lastName].filter(Boolean).join(' ') ||
                          r.reviewer?.email ||
                          'Anonymous'}
                        {r.verified && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                            <CheckCircle className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-amber-500">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={
                              n <= r.rating ? 'h-3.5 w-3.5 fill-current' : 'h-3.5 w-3.5 opacity-30'
                            }
                          />
                        ))}
                      </div>
                      {r.text && (
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{r.text}</p>
                      )}
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {new Date(r.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const reason = await promptDialog({
                          title: 'Delete review',
                          label: 'Reason for deleting this review (audit log)',
                          defaultValue: 'spam',
                        });
                        if (reason !== null) deleteReview.mutate({ reviewId: r.id, reason });
                      }}
                      isLoading={
                        deleteReview.isPending && deleteReview.variables?.reviewId === r.id
                      }
                    >
                      <Trash2 className="h-4 w-4 text-[var(--error)]" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card padding="md">
      <p className="text-xs tracking-wider text-[var(--text-muted)] uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
    </Card>
  );
}
