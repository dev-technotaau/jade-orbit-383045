'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  PlayCircle,
  Mail,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
  UserPlus,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import DatePicker from '@/components/ui/DatePicker';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog, promptDialog } from '@/components/ui/dialog-service';
import { assistedHiringService } from '@/services/assisted-hiring.service';
import type { ApiError } from '@/types/api';

export default function SuperAdminAssistedHiringDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const { data: req, isLoading } = useQuery({
    queryKey: ['super-admin', 'assisted-hiring', id],
    queryFn: () => assistedHiringService.superAdmin.detail(id),
    enabled: !!id,
  });

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [callAt, setCallAt] = useState('');
  const [callNotes, setCallNotes] = useState('');

  const [profileOpen, setProfileOpen] = useState(false);
  const [pf, setPf] = useState({
    candidateName: '',
    candidateHeadline: '',
    candidateExperience: '',
    candidateLocation: '',
    resumeUrl: '',
    notes: '',
  });

  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverMsg, setDeliverMsg] = useState('');

  const claim = useMutation({
    mutationFn: () => assistedHiringService.superAdmin.claim(id),
    onSuccess: (r) => {
      qc.setQueryData(['super-admin', 'assisted-hiring', id], r);
      showToast.success('Claimed');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to claim');
    },
  });

  const schedule = useMutation({
    mutationFn: () =>
      assistedHiringService.superAdmin.scheduleCall(
        id,
        new Date(callAt).toISOString(),
        callNotes.trim() || undefined,
      ),
    onSuccess: (r) => {
      qc.setQueryData(['super-admin', 'assisted-hiring', id], r);
      setScheduleOpen(false);
      setCallAt('');
      setCallNotes('');
      showToast.success('Call scheduled');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to schedule');
    },
  });

  const start = useMutation({
    mutationFn: () => assistedHiringService.superAdmin.startSourcing(id),
    onSuccess: (r) => {
      qc.setQueryData(['super-admin', 'assisted-hiring', id], r);
      showToast.success('Marked as sourcing');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to mark in progress');
    },
  });

  const addProfile = useMutation({
    mutationFn: () =>
      assistedHiringService.superAdmin.addProfile(id, {
        candidateName: pf.candidateName.trim(),
        candidateHeadline: pf.candidateHeadline.trim() || undefined,
        candidateExperience: pf.candidateExperience.trim() || undefined,
        candidateLocation: pf.candidateLocation.trim() || undefined,
        resumeUrl: pf.resumeUrl.trim() || undefined,
        notes: pf.notes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'assisted-hiring', id] });
      setProfileOpen(false);
      setPf({
        candidateName: '',
        candidateHeadline: '',
        candidateExperience: '',
        candidateLocation: '',
        resumeUrl: '',
        notes: '',
      });
      showToast.success('Profile added');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to add profile');
    },
  });

  const removeProfile = useMutation({
    mutationFn: (profileId: string) => assistedHiringService.superAdmin.removeProfile(profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'assisted-hiring', id] });
      showToast.success('Profile removed');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to remove');
    },
  });

  const deliver = useMutation({
    mutationFn: () => assistedHiringService.superAdmin.deliver(id, deliverMsg.trim() || undefined),
    onSuccess: (r) => {
      qc.setQueryData(['super-admin', 'assisted-hiring', id], r);
      setDeliverOpen(false);
      setDeliverMsg('');
      showToast.success('Profiles delivered to employer');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to deliver');
    },
  });

  const complete = useMutation({
    mutationFn: () => assistedHiringService.superAdmin.complete(id),
    onSuccess: (r) => {
      qc.setQueryData(['super-admin', 'assisted-hiring', id], r);
      showToast.success('Marked completed');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to mark completed');
    },
  });

  const cancel = useMutation({
    mutationFn: (reason?: string) => assistedHiringService.superAdmin.cancel(id, reason),
    onSuccess: (r) => {
      qc.setQueryData(['super-admin', 'assisted-hiring', id], r);
      showToast.success('Request cancelled');
    },
    onError: (e) => {
      const apiErr = e as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to cancel');
    },
  });

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="assisted_hiring.view"
    >
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/super-admin/assisted-hiring')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to queue
        </Button>

        {isLoading && (
          <Card padding="lg">
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          </Card>
        )}

        {!isLoading && req && (
          <>
            <Card padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-[var(--text)]">{req.roleTitle}</h1>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Employer: {req.employer?.firstName ?? ''} {req.employer?.lastName ?? ''} ·{' '}
                    <a className="underline" href={`mailto:${req.employer?.email}`}>
                      {req.employer?.email}
                    </a>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="info">{req.status.replace('_', ' ')}</Badge>
                    {req.assignedAdmin && (
                      <Badge variant="neutral">
                        Owner: {req.assignedAdmin.firstName ?? ''}{' '}
                        {req.assignedAdmin.lastName ?? ''}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!req.assignedAdminId && (
                    <Button
                      variant="outline"
                      onClick={() => claim.mutate()}
                      disabled={claim.isPending}
                    >
                      <UserPlus className="mr-1 h-4 w-4" /> Claim
                    </Button>
                  )}
                  {(req.status === 'PENDING' || req.status === 'CALL_SCHEDULED') && (
                    <Button variant="outline" onClick={() => setScheduleOpen(true)}>
                      <Phone className="mr-1 h-4 w-4" />{' '}
                      {req.status === 'CALL_SCHEDULED' ? 'Reschedule' : 'Schedule call'}
                    </Button>
                  )}
                  {(req.status === 'PENDING' || req.status === 'CALL_SCHEDULED') && (
                    <Button
                      variant="primary"
                      onClick={() => start.mutate()}
                      disabled={start.isPending}
                    >
                      <PlayCircle className="mr-1 h-4 w-4" /> Start sourcing
                    </Button>
                  )}
                  {req.status === 'IN_PROGRESS' && (
                    <Button
                      variant="primary"
                      onClick={() => setDeliverOpen(true)}
                      disabled={(req.matchedProfiles?.length ?? 0) === 0}
                    >
                      <Mail className="mr-1 h-4 w-4" /> Deliver to employer
                    </Button>
                  )}
                  {req.status === 'DELIVERED' && (
                    <Button
                      variant="primary"
                      onClick={() => complete.mutate()}
                      disabled={complete.isPending}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Mark completed
                    </Button>
                  )}
                  {req.status !== 'COMPLETED' && req.status !== 'CANCELLED' && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const r = await promptDialog({
                          title: 'Cancel',
                          label: 'Cancellation reason (optional):',
                          multiline: true,
                        });
                        if (r === null) return;
                        cancel.mutate(r || undefined);
                      }}
                    >
                      <XCircle className="mr-1 h-4 w-4" /> Cancel
                    </Button>
                  )}
                </div>
              </div>

              {req.callScheduledAt && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  <Phone className="h-4 w-4" /> Call:{' '}
                  {new Date(req.callScheduledAt).toLocaleString()}
                </p>
              )}
            </Card>

            <Card padding="lg">
              <h2 className="text-lg font-semibold text-[var(--text)]">Requirement</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Description" value={req.requirementText} multiline />
                <Field
                  label="Skills"
                  value={req.preferredSkills.length > 0 ? req.preferredSkills.join(', ') : '—'}
                />
                <Field label="Location" value={req.preferredLocation || '—'} />
                <Field label="Budget" value={req.budgetRange || '—'} />
                <Field label="Notice period" value={req.noticePeriod || '—'} />
                <Field label="Phone" value={req.contactPhone || '—'} />
                <Field label="Contact email" value={req.contactEmail} />
                <Field
                  label="Linked job post"
                  value={
                    req.jobPost ? (
                      <a className="underline" href={`/super-admin/jobs/${req.jobPost.id}`}>
                        {req.jobPost.title}
                      </a>
                    ) : (
                      '—'
                    )
                  }
                />
              </div>
              {req.internalNotes && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <span className="font-semibold">Internal notes:</span> {req.internalNotes}
                </div>
              )}
            </Card>

            <Card padding="lg">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  Matched profiles ({req.matchedProfiles?.length ?? 0})
                </h2>
                {req.status !== 'COMPLETED' && req.status !== 'CANCELLED' && (
                  <Button variant="outline" onClick={() => setProfileOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Add profile
                  </Button>
                )}
              </div>
              {(req.matchedProfiles?.length ?? 0) === 0 && (
                <EmptyState
                  icon={UserPlus}
                  title="No matched profiles yet"
                  description="Add 4-5 candidate matches before delivering to the employer."
                />
              )}
              {(req.matchedProfiles?.length ?? 0) > 0 && (
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {req.matchedProfiles!.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            {p.candidateName}
                          </p>
                          {p.candidateHeadline && (
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              {p.candidateHeadline}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {p.candidateExperience && (
                              <Badge variant="neutral">{p.candidateExperience}</Badge>
                            )}
                            {p.candidateLocation && (
                              <Badge variant="neutral">{p.candidateLocation}</Badge>
                            )}
                          </div>
                          {p.resumeUrl && (
                            <a
                              href={p.resumeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary mt-2 inline-block text-xs font-semibold underline"
                            >
                              Open CV
                            </a>
                          )}
                          {p.notes && (
                            <p className="mt-2 text-xs text-[var(--text-muted)]">{p.notes}</p>
                          )}
                        </div>
                        {req.status !== 'COMPLETED' && req.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                await confirmDialog({
                                  title: 'Remove profile',
                                  message: 'Remove this matched profile?',
                                  confirmLabel: 'Remove',
                                  variant: 'danger',
                                })
                              ) {
                                removeProfile.mutate(p.id);
                              }
                            }}
                            className="rounded p-1 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Schedule call */}
      <Modal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule discovery call"
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => schedule.mutate()}
              disabled={!callAt || schedule.isPending}
            >
              Schedule
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <DatePicker
            label="Call date & time"
            mode="datetime"
            value={callAt}
            onChange={setCallAt}
          />
          <Textarea
            label="Internal notes (optional)"
            rows={3}
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
          />
        </div>
      </Modal>

      {/* Add matched profile */}
      <Modal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Add matched profile"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => addProfile.mutate()}
              disabled={!pf.candidateName.trim() || addProfile.isPending}
            >
              Add profile
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Candidate name"
            value={pf.candidateName}
            onChange={(e) => setPf({ ...pf, candidateName: e.target.value })}
            required
          />
          <Input
            label="Headline"
            value={pf.candidateHeadline}
            onChange={(e) => setPf({ ...pf, candidateHeadline: e.target.value })}
          />
          <Input
            label="Experience"
            value={pf.candidateExperience}
            onChange={(e) => setPf({ ...pf, candidateExperience: e.target.value })}
            placeholder="e.g. 6 years"
          />
          <Input
            label="Location"
            value={pf.candidateLocation}
            onChange={(e) => setPf({ ...pf, candidateLocation: e.target.value })}
          />
          <Input
            label="Resume URL"
            value={pf.resumeUrl}
            onChange={(e) => setPf({ ...pf, resumeUrl: e.target.value })}
            placeholder="https://..."
          />
          <Textarea
            label="Notes"
            rows={3}
            value={pf.notes}
            onChange={(e) => setPf({ ...pf, notes: e.target.value })}
            className="md:col-span-2"
          />
        </div>
      </Modal>

      {/* Deliver */}
      <Modal
        isOpen={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        title="Deliver profiles to employer"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeliverOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => deliver.mutate()} disabled={deliver.isPending}>
              Send delivery email
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">
          The employer will receive an email + WhatsApp with the matched profiles. Their plan quota
          will be marked used after delivery.
        </p>
        <Textarea
          label="Custom message (optional)"
          rows={3}
          value={deliverMsg}
          onChange={(e) => setDeliverMsg(e.target.value)}
          className="mt-3"
        />
      </Modal>
    </DashboardLayout>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
        {label}
      </p>
      <div className={`mt-1 text-sm text-[var(--text)] ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {value}
      </div>
    </div>
  );
}
