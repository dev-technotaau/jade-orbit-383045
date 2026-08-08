'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Building2,
  Search,
  MapPin,
  Briefcase,
  ArrowRight,
  BadgeCheck,
  Star,
  Zap,
  Send,
} from 'lucide-react';
import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import Pagination from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import { vendorService } from '@/services/vendor.service';
import { useAuth } from '@/hooks/use-auth';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

export default function VendorsDirectoryPage() {
  const { user } = useAuth();
  const isEmployer =
    user?.role === 'EMPLOYER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  // Authenticated candidates/employers get the dashboard chrome here (see
  // PublicLayout); the breadcrumb belongs only to the public marketing shell.
  const inDashboardChrome = user?.role === 'CANDIDATE' || user?.role === 'EMPLOYER';

  const [q, setQ] = useState('');
  const [service, setService] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(30);

  // Auto-routing modal state — 2 steps:
  //   1. 'form'    → enter requirement + filters, click "Preview matches"
  //   2. 'preview' → see top-3 vendor cards with scores, click "Confirm & send"
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoStep, setAutoStep] = useState<'form' | 'preview'>('form');
  const [reqText, setReqText] = useState('');
  const [reqEmail, setReqEmail] = useState(user?.email ?? '');
  const [reqPhone, setReqPhone] = useState('');
  const [reqServices, setReqServices] = useState('');
  const [reqLocations, setReqLocations] = useState('');
  const [matchPreviewItems, setMatchPreviewItems] = useState<
    import('@/services/vendor.service').VendorMatchPreview[]
  >([]);

  const csv = (s: string) =>
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

  function resetAutoModal() {
    setShowAutoModal(false);
    setAutoStep('form');
    setReqText('');
    setMatchPreviewItems([]);
  }

  const previewMatches = useMutation({
    mutationFn: () =>
      vendorService.previewMatches({
        services: csv(reqServices),
        locations: csv(reqLocations),
        limit: 3,
      }),
    onSuccess: (result) => {
      if (result.matches.length === 0) {
        showToast.error(
          'No matches found — try different services/locations, or send a direct lead from a vendor card.',
        );
        return;
      }
      setMatchPreviewItems(result.matches);
      setAutoStep('preview');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to preview matches');
    },
  });

  const autoRoute = useMutation({
    mutationFn: () =>
      vendorService.matchAndSendLead({
        requirementText: reqText.trim(),
        contactEmail: reqEmail.trim(),
        contactPhone: reqPhone.trim() || undefined,
        // Pass the explicit IDs from the preview so what the user saw is
        // exactly what gets contacted — no re-matching surprise.
        vendorIds: matchPreviewItems.map((m) => m.id),
      }),
    onSuccess: (result) => {
      if (result.matched === 0) {
        showToast.error('No matches reachable — they may have just lapsed. Try direct outreach.');
        return;
      }
      showToast.success(
        `Lead sent to ${result.matched} vendor${result.matched === 1 ? '' : 's'}`,
        result.vendors.map((v) => v.businessName).join(', '),
      );
      resetAutoModal();
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to send lead');
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', 'public', { q, service, location, page, limit }],
    queryFn: () =>
      vendorService.listPublic({
        q: q || undefined,
        service: service || undefined,
        location: location || undefined,
        page,
        limit,
      }),
  });

  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.pages ?? Math.ceil(total / limit);

  return (
    <PublicLayout>
      <div className="bg-[var(--bg)]">
        <section className="under-public-header bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg)] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">
              Recruitment Partners on Hire Adda
            </h1>
            <p className="mt-4 text-base text-[var(--text-muted)]">
              Find vetted staffing agencies and recruitment consultants by service, industry and
              location.
            </p>
            {isEmployer && (
              <div className="mt-6">
                <Button variant="primary" onClick={() => setShowAutoModal(true)}>
                  <Zap className="mr-1.5 h-4 w-4" /> Auto-match top 3 vendors
                </Button>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Describe your role once — we&apos;ll fan it out to the 3 best-matching vendors.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="px-4 pb-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Card padding="md" className="mb-6">
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="Search by name or keyword"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  leftIcon={<Search className="h-4 w-4" />}
                />
                <Input
                  placeholder="Service (e.g. Permanent staffing)"
                  value={service}
                  onChange={(e) => {
                    setService(e.target.value);
                    setPage(1);
                  }}
                  leftIcon={<Briefcase className="h-4 w-4" />}
                />
                <Input
                  placeholder="Location (e.g. Mumbai)"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setPage(1);
                  }}
                  leftIcon={<MapPin className="h-4 w-4" />}
                />
              </div>
            </Card>

            {isLoading && (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            )}
            {!isLoading && data && data.items.length === 0 && (
              <EmptyState
                icon={Building2}
                title="No vendors match your filters"
                description="Try widening your search — clear filters above and browse all listed vendors."
              />
            )}
            {!isLoading && data && data.items.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.items.map((v) => (
                  <Link key={v.id} href={ROUTES.VENDORS_PUBLIC.DETAIL(v.slug)}>
                    <Card
                      padding="lg"
                      className="hover:border-primary/30 flex h-full flex-col transition-all hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/30">
                          {v.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={v.logo}
                              alt={v.businessName}
                              className="h-12 w-12 rounded-xl object-contain"
                            />
                          ) : (
                            <Building2 className="h-6 w-6" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate font-semibold text-[var(--text)]">
                            {v.businessName}
                            {v.isVerified && (
                              <BadgeCheck className="h-4 w-4 text-blue-600" aria-label="Verified" />
                            )}
                          </p>
                          {v.yearsInBusiness != null && (
                            <p className="text-xs text-[var(--text-muted)]">
                              {v.yearsInBusiness} yrs in business
                              {v.teamSize ? ` · ${v.teamSize} on team` : ''}
                            </p>
                          )}
                          {v.reviewCount > 0 && v.avgRating != null && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600">
                              <Star className="h-3 w-3 fill-current" />
                              {v.avgRating.toFixed(1)}
                              <span className="text-[var(--text-muted)]">({v.reviewCount})</span>
                            </p>
                          )}
                        </div>
                      </div>
                      {v.description && (
                        <p className="mt-3 line-clamp-3 text-sm text-[var(--text-secondary)]">
                          {v.description}
                        </p>
                      )}
                      {v.services.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {v.services.slice(0, 3).map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-200"
                            >
                              {s}
                            </span>
                          ))}
                          {v.services.length > 3 && (
                            <span className="text-xs text-[var(--text-muted)]">
                              +{v.services.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-auto pt-4 text-right">
                        <span className="text-primary inline-flex items-center gap-1 text-sm font-semibold">
                          View details <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
            {!isLoading && data && data.items.length > 0 && (
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
                className="mt-8"
              />
            )}
          </div>
        </section>
      </div>

      {showAutoModal && (
        <Modal
          isOpen
          onClose={resetAutoModal}
          title={
            autoStep === 'form'
              ? 'Find matching vendors'
              : `Confirm — ${matchPreviewItems.length} vendor${matchPreviewItems.length === 1 ? '' : 's'} will receive your lead`
          }
          size="lg"
        >
          {autoStep === 'form' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Describe your hiring need — we&apos;ll show you the top 3 matching vendors before
                sending. You confirm before any vendor is contacted.
              </p>
              <Textarea
                label="What are you hiring for?"
                required
                rows={5}
                value={reqText}
                onChange={(e) => setReqText(e.target.value)}
                placeholder="Role title, skills, location, urgency, salary range — at least 20 characters."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Services needed (comma-separated)"
                  value={reqServices}
                  onChange={(e) => setReqServices(e.target.value)}
                  placeholder="Permanent staffing, Executive search"
                />
                <Input
                  label="Locations (comma-separated)"
                  value={reqLocations}
                  onChange={(e) => setReqLocations(e.target.value)}
                  placeholder="Mumbai, Bengaluru"
                />
                <Input
                  label="Reply-to email"
                  type="email"
                  required
                  value={reqEmail}
                  onChange={(e) => setReqEmail(e.target.value)}
                />
                <Input
                  label="Phone (optional)"
                  value={reqPhone}
                  onChange={(e) => setReqPhone(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
                <Button variant="outline" onClick={resetAutoModal}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => previewMatches.mutate()}
                  isLoading={previewMatches.isPending}
                  disabled={
                    reqText.trim().length < 20 ||
                    !reqEmail.trim() ||
                    (csv(reqServices).length === 0 && csv(reqLocations).length === 0)
                  }
                >
                  Preview matches <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {autoStep === 'preview' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                These vendors scored highest against your requirement. Confirm to send your lead to
                all of them at once — each receives a private email and responds in their own inbox.
              </p>
              <ul className="space-y-2">
                {matchPreviewItems.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3"
                  >
                    <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30">
                      {m.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.logo}
                          alt={m.businessName}
                          className="h-12 w-12 object-contain"
                        />
                      ) : (
                        <Building2 className="h-6 w-6" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-semibold text-[var(--text)]">
                          {m.businessName}
                        </p>
                        {m.isVerified && (
                          <BadgeCheck className="h-4 w-4 text-blue-600" aria-label="Verified" />
                        )}
                      </div>
                      {m.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
                          {m.description}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                        {m.services.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200"
                          >
                            {s}
                          </span>
                        ))}
                        {m.locations.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {m.locations.slice(0, 2).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <Tooltip content="Match score" className="flex-none">
                      <span className="flex flex-none flex-col items-center justify-center rounded-lg bg-amber-50 px-2 py-1 text-amber-700">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span className="text-xs font-bold">{m.score}</span>
                      </span>
                    </Tooltip>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-3">
                <Button variant="ghost" onClick={() => setAutoStep('form')}>
                  ← Back to edit
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetAutoModal}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => autoRoute.mutate()}
                    isLoading={autoRoute.isPending}
                  >
                    <Send className="mr-1.5 h-4 w-4" /> Confirm &amp; send to{' '}
                    {matchPreviewItems.length}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Breadcrumbs — public marketing shell only. No `breadcrumbSchema`
          is declared at page level, so the component emits its own
          BreadcrumbList JSON-LD via the href on every item. */}
      {!inDashboardChrome && (
        <div className="border-t border-[var(--border)] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <Breadcrumbs items={[{ name: 'Vendors', href: '/vendors' }]} />
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
