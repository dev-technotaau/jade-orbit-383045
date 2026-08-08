'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ClipboardList,
  Phone,
  CheckCircle2,
  Clock,
  PlayCircle,
  XCircle,
  ArrowRight,
  Mail,
  Sparkles,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import {
  assistedHiringService,
  type AssistedHiringRequest,
  type AssistedHiringStatus,
} from '@/services/assisted-hiring.service';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

const STATUS_LABEL: Record<
  AssistedHiringStatus,
  { label: string; tone: 'gray' | 'blue' | 'amber' | 'green' | 'red' }
> = {
  PENDING: { label: 'Pending — call to be scheduled', tone: 'gray' },
  CALL_SCHEDULED: { label: 'Call scheduled', tone: 'blue' },
  IN_PROGRESS: { label: 'Sourcing in progress', tone: 'amber' },
  DELIVERED: { label: 'Profiles delivered', tone: 'green' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'red' },
};

function StatusBadge({ status }: { status: AssistedHiringStatus }) {
  const meta = STATUS_LABEL[status];
  const colour =
    meta.tone === 'gray'
      ? 'bg-slate-100 text-slate-700'
      : meta.tone === 'blue'
        ? 'bg-blue-100 text-blue-700'
        : meta.tone === 'amber'
          ? 'bg-amber-100 text-amber-700'
          : meta.tone === 'green'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-red-100 text-red-700';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${colour}`}
    >
      {meta.label}
    </span>
  );
}

function Timeline({ request }: { request: AssistedHiringRequest }) {
  const steps: { id: AssistedHiringStatus; label: string; icon: typeof Clock }[] = [
    { id: 'PENDING', label: 'Requirement received', icon: ClipboardList },
    { id: 'CALL_SCHEDULED', label: 'Call scheduled', icon: Phone },
    { id: 'IN_PROGRESS', label: 'Sourcing CVs', icon: PlayCircle },
    { id: 'DELIVERED', label: 'Profiles delivered', icon: Sparkles },
    { id: 'COMPLETED', label: 'Hire confirmed', icon: CheckCircle2 },
  ];
  if (request.status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <XCircle className="h-4 w-4" /> Cancelled
      </div>
    );
  }
  const currentIdx = steps.findIndex((s) => s.id === request.status);
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      {steps.map((s, idx) => {
        const Icon = s.icon;
        const done = idx < currentIdx || request.status === 'COMPLETED';
        const active = idx === currentIdx && request.status !== 'COMPLETED';
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                done
                  ? 'bg-emerald-500 text-white'
                  : active
                    ? 'bg-blue-500 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p
                className={`text-xs font-medium ${
                  done || active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {s.label}
              </p>
            </div>
            {idx < steps.length - 1 && (
              <ArrowRight className="hidden h-4 w-4 text-[var(--text-muted)] sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function EmployerAssistedHiringPage() {
  const qc = useQueryClient();
  const { data: request, isLoading } = useQuery({
    queryKey: ['employer', 'assisted-hiring', 'me'],
    queryFn: () => assistedHiringService.getMine(),
  });

  const [form, setForm] = useState({
    roleTitle: '',
    requirementText: '',
    preferredSkills: '',
    preferredLocation: '',
    budgetRange: '',
    noticePeriod: '',
    contactPhone: '',
  });

  useEffect(() => {
    if (request) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        roleTitle: request.roleTitle ?? '',
        requirementText: request.requirementText ?? '',
        preferredSkills: (request.preferredSkills ?? []).join(', '),
        preferredLocation: request.preferredLocation ?? '',
        budgetRange: request.budgetRange ?? '',
        noticePeriod: request.noticePeriod ?? '',
        contactPhone: request.contactPhone ?? '',
      });
    }
  }, [request]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!request) throw new Error('No active request');
      return assistedHiringService.updateRequirement(request.id, {
        roleTitle: form.roleTitle.trim() || undefined,
        requirementText: form.requirementText.trim() || undefined,
        preferredSkills: form.preferredSkills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferredLocation: form.preferredLocation.trim() || undefined,
        budgetRange: form.budgetRange.trim() || undefined,
        noticePeriod: form.noticePeriod.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employer', 'assisted-hiring', 'me'] });
      showToast.success('Requirement updated', 'Our team will use the latest details.');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to update');
    },
  });

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Assisted hiring</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Our team helps you source 4-5 matching CVs for one role within 7 days.
          </p>
        </div>

        {isLoading && (
          <Card padding="lg">
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          </Card>
        )}

        {!isLoading && !request && (
          <Card padding="lg">
            <EmptyState
              icon={ClipboardList}
              title="No active assisted hiring request"
              description="Buy the Assisted Hiring plan and our team will reach out to scope your role and source candidates for you."
              action={
                <Link href={ROUTES.BILLING.PRICING_EMPLOYER}>
                  <Button variant="primary">View plans</Button>
                </Link>
              }
            />
          </Card>
        )}

        {!isLoading && request && (
          <>
            <Card padding="lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={request.status} />
                  </div>
                </div>
                <div className="text-right text-xs text-[var(--text-muted)]">
                  Started {new Date(request.startedAt).toLocaleDateString()}
                  {request.expiresAt && (
                    <>
                      <br />
                      Validity ends {new Date(request.expiresAt).toLocaleDateString()}
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <Timeline request={request} />
              </div>

              {request.callScheduledAt && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  <Phone className="h-4 w-4" /> Call scheduled for{' '}
                  {new Date(request.callScheduledAt).toLocaleString()}
                </p>
              )}
              {request.assignedAdmin && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Your dedicated specialist:{' '}
                  <span className="font-medium text-[var(--text)]">
                    {request.assignedAdmin.firstName ?? ''} {request.assignedAdmin.lastName ?? ''}
                  </span>{' '}
                  ·{' '}
                  <a className="underline" href={`mailto:${request.assignedAdmin.email}`}>
                    {request.assignedAdmin.email}
                  </a>
                </p>
              )}
            </Card>

            {/* Requirement editor — locked once delivered/completed/cancelled */}
            <Card padding="lg">
              <h2 className="text-lg font-semibold text-[var(--text)]">Role requirement</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Add as much detail as possible — clearer requirements lead to better matches.
              </p>
              <div className="mt-4 grid gap-4">
                <Input
                  label="Role title"
                  value={form.roleTitle}
                  onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
                  placeholder="e.g. Senior React Engineer"
                  disabled={
                    request.status === 'DELIVERED' ||
                    request.status === 'COMPLETED' ||
                    request.status === 'CANCELLED'
                  }
                />
                <Textarea
                  label="What we should look for"
                  rows={5}
                  value={form.requirementText}
                  onChange={(e) => setForm({ ...form, requirementText: e.target.value })}
                  placeholder="Describe responsibilities, experience required, must-have skills, working hours, etc."
                  disabled={
                    request.status === 'DELIVERED' ||
                    request.status === 'COMPLETED' ||
                    request.status === 'CANCELLED'
                  }
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Preferred skills (comma separated)"
                    value={form.preferredSkills}
                    onChange={(e) => setForm({ ...form, preferredSkills: e.target.value })}
                    placeholder="React, Node.js, AWS"
                    disabled={
                      request.status === 'DELIVERED' ||
                      request.status === 'COMPLETED' ||
                      request.status === 'CANCELLED'
                    }
                  />
                  <Input
                    label="Preferred location"
                    value={form.preferredLocation}
                    onChange={(e) => setForm({ ...form, preferredLocation: e.target.value })}
                    placeholder="Bengaluru / Remote"
                    disabled={
                      request.status === 'DELIVERED' ||
                      request.status === 'COMPLETED' ||
                      request.status === 'CANCELLED'
                    }
                  />
                  <Input
                    label="Budget / CTC range"
                    value={form.budgetRange}
                    onChange={(e) => setForm({ ...form, budgetRange: e.target.value })}
                    placeholder="₹15-25 LPA"
                    disabled={
                      request.status === 'DELIVERED' ||
                      request.status === 'COMPLETED' ||
                      request.status === 'CANCELLED'
                    }
                  />
                  <Input
                    label="Notice period"
                    value={form.noticePeriod}
                    onChange={(e) => setForm({ ...form, noticePeriod: e.target.value })}
                    placeholder="Immediate / 30 days"
                    disabled={
                      request.status === 'DELIVERED' ||
                      request.status === 'COMPLETED' ||
                      request.status === 'CANCELLED'
                    }
                  />
                </div>
                <PhoneInput
                  label="Contact phone (WhatsApp)"
                  value={form.contactPhone}
                  onValueChange={(val) => setForm({ ...form, contactPhone: val })}
                  placeholder="9876xxxxxx"
                  disabled={
                    request.status === 'DELIVERED' ||
                    request.status === 'COMPLETED' ||
                    request.status === 'CANCELLED'
                  }
                />
              </div>
              {request.status !== 'DELIVERED' &&
                request.status !== 'COMPLETED' &&
                request.status !== 'CANCELLED' && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="primary"
                      isLoading={saveMutation.isPending}
                      disabled={saveMutation.isPending}
                      onClick={() => saveMutation.mutate()}
                    >
                      Save requirement
                    </Button>
                  </div>
                )}
            </Card>

            {/* Delivered profiles */}
            {request.matchedProfiles && request.matchedProfiles.length > 0 && (
              <Card padding="lg">
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Matched profiles ({request.matchedProfiles.length})
                </h2>
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {request.matchedProfiles.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {p.candidateName}
                          </p>
                          {p.candidateHeadline && (
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              {p.candidateHeadline}
                            </p>
                          )}
                        </div>
                        {p.resumeUrl && (
                          <a
                            href={p.resumeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-xs font-semibold underline"
                          >
                            View CV
                          </a>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                        {p.candidateExperience && (
                          <Badge variant="neutral">{p.candidateExperience}</Badge>
                        )}
                        {p.candidateLocation && (
                          <Badge variant="neutral">{p.candidateLocation}</Badge>
                        )}
                      </div>
                      {p.notes && (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">{p.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Help footer */}
            <Card padding="md">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-muted)]">
                  Need to update something urgently? Reply to your delivery email or reach our team
                  via the in-app help & support page.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
