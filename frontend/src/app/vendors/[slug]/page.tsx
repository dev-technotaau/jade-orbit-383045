'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ArrowLeft,
  Globe,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  BadgeCheck,
  Users,
  Send,
  Star,
  CheckCircle,
} from 'lucide-react';
import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { vendorService } from '@/services/vendor.service';
import { useAuth } from '@/hooks/use-auth';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

export default function VendorDetailPage() {
  const params = useParams();
  const slug = String(params?.slug ?? '');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadText, setLeadText] = useState('');
  const [leadEmail, setLeadEmail] = useState(user?.email ?? '');
  const [leadPhone, setLeadPhone] = useState('');

  // Review form state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors', 'public', slug],
    queryFn: () => vendorService.getPublicBySlug(slug),
    enabled: Boolean(slug),
  });

  const sendLead = useMutation({
    mutationFn: () =>
      vendorService.sendLead({
        slug,
        requirementText: leadText.trim(),
        contactEmail: leadEmail.trim(),
        contactPhone: leadPhone.trim() || undefined,
      }),
    onSuccess: () => {
      showToast.success('Lead sent', 'The vendor has been notified.');
      setShowLeadModal(false);
      setLeadText('');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to send lead');
    },
  });

  const { data: reviews } = useQuery({
    queryKey: ['vendors', 'reviews', slug],
    queryFn: () => vendorService.listReviews(slug, 1, 10),
    enabled: Boolean(slug),
  });

  const submitReview = useMutation({
    mutationFn: () =>
      vendorService.upsertReview({
        slug,
        rating: reviewRating,
        text: reviewText.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors', 'reviews', slug] });
      queryClient.invalidateQueries({ queryKey: ['vendors', 'public', slug] });
      showToast.success('Thanks — your review has been posted');
      setShowReviewModal(false);
      setReviewText('');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to submit review');
    },
  });

  if (isLoading) {
    return (
      <PublicLayout>
        {/* The offset lives on a plain block wrapper, not on the flex row: a
            `::before` spacer inside a flex container becomes a flex ITEM, so it
            would sit beside the spinner instead of pushing it clear of the
            overlaying header. */}
        <div className="under-public-header">
          <div className="flex min-h-[60vh] items-center justify-center">
            <Spinner size="lg" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (!data || error) {
    return (
      <PublicLayout>
        <div className="under-public-header px-4 py-12">
          <div className="mx-auto max-w-3xl">
            <Card padding="lg">
              <p className="text-sm text-[var(--text-muted)]">Vendor not found.</p>
              <Link
                href={ROUTES.VENDORS_PUBLIC.LIST}
                className="text-primary mt-3 inline-flex items-center gap-1 text-sm hover:underline"
              >
                <ArrowLeft className="h-4 w-4" /> Back to directory
              </Link>
            </Card>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const isEmployer =
    user?.role === 'EMPLOYER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  // Authenticated candidates/employers get the dashboard chrome here (see
  // PublicLayout); the breadcrumb belongs only to the public marketing shell.
  const inDashboardChrome = user?.role === 'CANDIDATE' || user?.role === 'EMPLOYER';

  return (
    <PublicLayout>
      <div className="under-public-header bg-[var(--bg)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            href={ROUTES.VENDORS_PUBLIC.LIST}
            className="text-primary mb-4 inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> All vendors
          </Link>

          <Card padding="lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 flex-none items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/30">
                {data.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.logo}
                    alt={data.businessName}
                    className="h-16 w-16 rounded-xl object-contain"
                  />
                ) : (
                  <Building2 className="h-8 w-8" />
                )}
              </div>
              <div className="flex-1">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
                  {data.businessName}
                  {data.isVerified && (
                    <BadgeCheck className="h-5 w-5 text-blue-600" aria-label="Verified" />
                  )}
                </h1>
                {data.description && (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{data.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
                  {reviews && reviews.reviewCount > 0 && reviews.avgRating != null && (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <Star className="h-4 w-4 fill-current" />
                      <strong>{reviews.avgRating.toFixed(1)}</strong>
                      <span className="text-[var(--text-muted)]">
                        ({reviews.reviewCount} review{reviews.reviewCount === 1 ? '' : 's'})
                      </span>
                    </span>
                  )}
                  {data.yearsInBusiness != null && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-4 w-4" /> {data.yearsInBusiness} yrs
                    </span>
                  )}
                  {data.teamSize != null && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-4 w-4" /> {data.teamSize} on team
                    </span>
                  )}
                  {data.website && (
                    <a
                      href={data.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <Globe className="h-4 w-4" /> Website
                    </a>
                  )}
                </div>
              </div>
              {isEmployer && (
                <Button variant="primary" onClick={() => setShowLeadModal(true)}>
                  <Send className="mr-1.5 h-4 w-4" /> Send hiring lead
                </Button>
              )}
            </div>

            {data.services.length > 0 && (
              <Section title="Services">
                <ChipList items={data.services} />
              </Section>
            )}
            {data.industries.length > 0 && (
              <Section title="Industries">
                <ChipList items={data.industries} />
              </Section>
            )}
            {data.locations.length > 0 && (
              <Section title="Locations">
                <ChipList items={data.locations} icon={MapPin} />
              </Section>
            )}

            <Section title="Contact">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ContactRow
                  icon={Mail}
                  label="Email"
                  value={data.contactEmail}
                  href={`mailto:${data.contactEmail}`}
                />
                <ContactRow
                  icon={Phone}
                  label="Phone"
                  value={data.contactPhone}
                  href={`tel:${data.contactPhone}`}
                />
              </div>
            </Section>

            <Section title="Reviews">
              <div className="flex items-center justify-between">
                <div>
                  {reviews && reviews.reviewCount > 0 ? (
                    <p className="flex items-center gap-1 text-sm text-[var(--text)]">
                      <Star className="h-4 w-4 fill-current text-amber-500" />
                      <strong>{reviews.avgRating?.toFixed(1)}</strong>
                      <span className="text-[var(--text-muted)]">
                        from {reviews.reviewCount} review{reviews.reviewCount === 1 ? '' : 's'}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      No reviews yet — be the first to share your experience.
                    </p>
                  )}
                </div>
                {isEmployer && (
                  <Button variant="outline" size="sm" onClick={() => setShowReviewModal(true)}>
                    <Star className="mr-1.5 h-4 w-4" /> Leave a review
                  </Button>
                )}
              </div>
              {reviews && reviews.items.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {reviews.items.map((r) => (
                    <li key={r.id} className="rounded-lg border border-[var(--border)] p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {[r.reviewer?.firstName, r.reviewer?.lastName]
                              .filter(Boolean)
                              .join(' ') || 'Anonymous'}
                          </p>
                          {r.verified && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                              <CheckCircle className="h-3 w-3" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 text-amber-500">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={
                                n <= r.rating
                                  ? 'h-3.5 w-3.5 fill-current'
                                  : 'h-3.5 w-3.5 opacity-30'
                              }
                            />
                          ))}
                        </div>
                      </div>
                      {r.text && (
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">{r.text}</p>
                      )}
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {new Date(r.createdAt).toLocaleDateString('en-IN')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </Card>
        </div>
      </div>

      {showLeadModal && (
        <Modal
          isOpen
          onClose={() => setShowLeadModal(false)}
          title={`Send a hiring lead to ${data.businessName}`}
          size="md"
        >
          <div className="space-y-3">
            <Textarea
              label="Hiring requirement"
              required
              rows={5}
              value={leadText}
              onChange={(e) => setLeadText(e.target.value)}
              placeholder="Describe the role(s) you're hiring for — title, skills, location, urgency, salary range."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Reply-to email"
                type="email"
                required
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
              />
              <Input
                label="Phone (optional)"
                value={leadPhone}
                onChange={(e) => setLeadPhone(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
              <Button variant="outline" onClick={() => setShowLeadModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => sendLead.mutate()}
                isLoading={sendLead.isPending}
                disabled={leadText.trim().length < 20 || !leadEmail.trim()}
              >
                <Send className="mr-1.5 h-4 w-4" /> Send lead
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showReviewModal && (
        <Modal
          isOpen
          onClose={() => setShowReviewModal(false)}
          title={`Review ${data.businessName}`}
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                Your rating
              </label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewRating(n)}
                    className={
                      n <= reviewRating ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'
                    }
                    aria-label={`${n} stars`}
                  >
                    <Star className="h-7 w-7 fill-current" />
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              label="What did you think? (optional)"
              rows={4}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share details about your experience working with this vendor."
            />
            <p className="text-xs text-[var(--text-muted)]">
              Reviewers who&apos;ve interacted with this vendor through Hire Adda show a
              &quot;Verified&quot; badge automatically.
            </p>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
              <Button variant="outline" onClick={() => setShowReviewModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => submitReview.mutate()}
                isLoading={submitReview.isPending}
              >
                <Star className="mr-1.5 h-4 w-4" /> Submit review
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Breadcrumbs — public marketing shell only. No page-level
          `breadcrumbSchema`, so the component emits its own
          BreadcrumbList JSON-LD via the href on each item. */}
      {!inDashboardChrome && (
        <div className="border-t border-[var(--border)] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <Breadcrumbs
              items={[
                { name: 'Vendors', href: '/vendors' },
                { name: data.businessName, href: `/vendors/${slug}` },
              ]}
            />
          </div>
        </div>
      )}
    </PublicLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-[var(--border)] pt-4">
      <h2 className="mb-2 text-sm font-semibold tracking-wider text-[var(--text-muted)] uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ChipList({
  items,
  icon: Icon,
}: {
  items: string[];
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-200"
        >
          {Icon && <Icon className="h-3 w-3" />}
          {item}
        </span>
      ))}
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-secondary)]"
    >
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="text-sm font-medium text-[var(--text)]">{value}</p>
      </div>
    </a>
  );
}
