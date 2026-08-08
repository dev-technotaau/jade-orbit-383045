'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, notFound } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  MapPin,
  Clock,
  Star,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  MessageSquare,
  User,
  Mail,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import Tag from '@/components/ui/Tag';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { useApplication, useUpdateApplicationStatus } from '@/hooks/use-jobs';
import { ROUTES } from '@/constants/routes';
import { QUERY_KEYS } from '@/constants/config';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_COLORS } from '@/constants/enums';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/job';
import type { ApiError } from '@/types/api';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusColorMap: Record<string, BadgeVariant> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  neutral: 'neutral',
};

const TIMELINE_STEPS: { key: ApplicationStatus; label: string }[] = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'VIEWED', label: 'Viewed' },
  { key: 'SHORTLISTED', label: 'Shortlisted' },
  { key: 'SELECTED', label: 'Selected' },
  { key: 'OFFERED', label: 'Offered' },
  { key: 'HIRED', label: 'Hired' },
];

const STATUS_ORDER: Record<string, number> = {
  APPLIED: 0,
  VIEWED: 1,
  SHORTLISTED: 2,
  SELECTED: 3,
  OFFERED: 4,
  HIRED: 5,
};

interface StatusAction {
  label: string;
  status: string;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
}

function getAvailableActions(currentStatus: string): StatusAction[] {
  const actions: StatusAction[] = [];

  if (['APPLIED', 'VIEWED'].includes(currentStatus)) {
    actions.push({ label: 'Shortlist', status: 'SHORTLISTED', variant: 'primary' });
  }
  if (['SHORTLISTED'].includes(currentStatus)) {
    actions.push({ label: 'Select', status: 'SELECTED', variant: 'primary' });
  }
  if (['SELECTED'].includes(currentStatus)) {
    actions.push({ label: 'Offer', status: 'OFFERED', variant: 'primary' });
  }
  if (['OFFERED'].includes(currentStatus)) {
    actions.push({ label: 'Mark Hired', status: 'HIRED', variant: 'primary' });
  }
  if (!['REJECTED', 'HIRED', 'WITHDRAWN'].includes(currentStatus)) {
    actions.push({ label: 'Reject', status: 'REJECTED', variant: 'destructive' });
  }

  return actions;
}

export default function EmployerApplicationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useApplication(id);
  const updateStatus = useUpdateApplicationStatus();
  const [rejectTarget, setRejectTarget] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER']}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner size="md" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data?.data) {
    notFound();
  }

  const app = data.data;
  const job = app.job;
  const candidate = app.candidate;
  const currentStepIndex = STATUS_ORDER[app.status] ?? -1;
  const isTerminal = ['REJECTED', 'WITHDRAWN'].includes(app.status);
  const actions = getAvailableActions(app.status);

  const handleStatusUpdate = (status: string) => {
    if (status === 'REJECTED') {
      setRejectTarget(true);
      return;
    }
    updateStatus.mutate(
      { applicationId: app.id, status },
      {
        onSuccess: () => {
          showToast.success(
            `Application ${APPLICATION_STATUS_LABELS[status]?.toLowerCase() || 'updated'}`,
          );
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.APPLICATION_DETAIL(id) });
        },
        onError: (err) => {
          const apiErr = err as unknown as ApiError;
          showToast.error(apiErr.message || 'Failed to update status');
        },
      },
    );
  };

  const handleReject = () => {
    updateStatus.mutate(
      { applicationId: app.id, status: 'REJECTED', rejectionReason },
      {
        onSuccess: () => {
          showToast.success('Application rejected');
          setRejectTarget(false);
          setRejectionReason('');
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.APPLICATION_DETAIL(id) });
        },
        onError: (err) => {
          const apiErr = err as unknown as ApiError;
          showToast.error(apiErr.message || 'Failed to reject application');
        },
      },
    );
  };

  const candidateName = candidate
    ? [candidate.user.firstName, candidate.user.lastName].filter(Boolean).join(' ') || 'Unknown'
    : 'Unknown';

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Tooltip content="Back to all applications">
            <Link
              href={ROUTES.EMPLOYER.APPLICATIONS}
              className="rounded-lg p-2 hover:bg-[var(--bg-secondary)]"
            >
              <ArrowLeft className="h-5 w-5 text-[var(--text-muted)]" />
            </Link>
          </Tooltip>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">Application Details</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Applied {formatRelativeDate(app.appliedAt)}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Candidate Info */}
            {candidate && (
              <Card>
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {candidate.user.avatar ? (
                      <img
                        src={candidate.user.avatar}
                        alt={candidateName}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="bg-primary/10 flex h-14 w-14 items-center justify-center rounded-full">
                        <User className="text-primary h-7 w-7" />
                      </div>
                    )}
                    <div className="flex-1">
                      <Tooltip content="View candidate profile">
                        <Link
                          href={ROUTES.EMPLOYER.CANDIDATE_DETAIL(candidate.id)}
                          className="hover:text-primary text-lg font-semibold text-[var(--text)]"
                        >
                          {candidateName}
                        </Link>
                      </Tooltip>
                      {candidate.headline && (
                        <p className="text-sm text-[var(--text-muted)]">{candidate.headline}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-light)]">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {candidate.user.email}
                        </span>
                        {candidate.experienceYears > 0 && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            {candidate.experienceYears} years experience
                          </span>
                        )}
                        {candidate.currentRole && candidate.currentCompany && (
                          <span>
                            {candidate.currentRole} at {candidate.currentCompany}
                          </span>
                        )}
                      </div>
                      {candidate.skills && candidate.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {candidate.skills.slice(0, 10).map((skill) => (
                            <Tag key={skill} label={skill} size="sm" />
                          ))}
                          {candidate.skills.length > 10 && (
                            <Tag label={`+${candidate.skills.length - 10}`} size="sm" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Status Timeline */}
            <Card>
              <div className="p-6">
                <h3 className="mb-4 text-sm font-semibold text-[var(--text)]">
                  Application Progress
                </h3>
                {isTerminal ? (
                  <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-secondary)] p-4">
                    {app.status === 'REJECTED' ? (
                      <XCircle className="h-5 w-5 text-[var(--error)]" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-[var(--text-muted)]" />
                    )}
                    <div>
                      <p className="font-medium text-[var(--text)]">
                        {APPLICATION_STATUS_LABELS[app.status]}
                      </p>
                      {app.status === 'REJECTED' && app.rejectionReason && (
                        <p className="mt-1 text-sm text-[var(--text-light)]">
                          {app.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {TIMELINE_STEPS.map((step, idx) => {
                      const isCompleted = idx <= currentStepIndex;
                      const isCurrent = idx === currentStepIndex;
                      return (
                        <div key={step.key} className="flex flex-1 items-center">
                          <div className="flex flex-col items-center gap-1">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                                isCurrent
                                  ? 'bg-primary text-white'
                                  : isCompleted
                                    ? 'bg-[var(--success)] text-white'
                                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                              }`}
                            >
                              {isCompleted && !isCurrent ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            <span
                              className={`text-center text-[10px] leading-tight ${isCurrent ? 'text-primary font-semibold' : isCompleted ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
                            >
                              {step.label}
                            </span>
                          </div>
                          {idx < TIMELINE_STEPS.length - 1 && (
                            <div
                              className={`mx-1 h-0.5 flex-1 ${idx < currentStepIndex ? 'bg-[var(--success)]' : 'bg-[var(--border)]'}`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* Screening Q&A */}
            {app.screeningAnswers && app.screeningAnswers.length > 0 && (
              <Card>
                <div className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <MessageSquare className="h-4 w-4" />
                    Screening Questions
                  </h3>
                  <div className="space-y-4">
                    {app.screeningAnswers.map((sa, idx) => (
                      <div key={sa.id} className="rounded-lg border border-[var(--border)] p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--text)]">
                            {idx + 1}. {sa.question.question}
                          </p>
                          <div className="flex gap-1.5">
                            {sa.question.isRequired && (
                              <Badge variant="info" size="sm">
                                Required
                              </Badge>
                            )}
                            {sa.question.isDealBreaker && (
                              <Badge variant="error" size="sm">
                                Deal Breaker
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-light)]">
                          <span className="font-medium">Answer:</span> {sa.answer}
                        </p>
                        {sa.question.idealAnswer && (
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            <span className="font-medium">Ideal:</span> {sa.question.idealAnswer}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Cover Letter */}
            {app.coverLetter && (
              <Card>
                <div className="p-6">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <FileText className="h-4 w-4" />
                    Cover Letter
                  </h3>
                  <div className="prose prose-sm max-w-none text-[var(--text-light)]">
                    <p className="whitespace-pre-wrap">{app.coverLetter}</p>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Right Column (Sidebar) */}
          <div className="space-y-6">
            {/* Status + Actions Card */}
            <Card>
              <div className="p-6">
                <div className="mb-4 text-center">
                  <Badge
                    variant={statusColorMap[APPLICATION_STATUS_COLORS[app.status]] || 'neutral'}
                    size="md"
                  >
                    {APPLICATION_STATUS_LABELS[app.status]}
                  </Badge>
                </div>
                {actions.length > 0 && (
                  <div className="space-y-2">
                    {actions.map((action) => (
                      <Button
                        key={action.status}
                        variant={action.variant}
                        className="w-full"
                        onClick={() => handleStatusUpdate(action.status)}
                        isLoading={updateStatus.isPending}
                        tooltip={`${action.label} this application`}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Match Score */}
            {app.matchScore != null && (
              <Card>
                <div className="flex items-center gap-3 p-6">
                  <Star className="h-5 w-5 text-[var(--warning)]" />
                  <div>
                    <p className="text-lg font-semibold text-[var(--text)]">
                      {Math.round(app.matchScore)}%
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">Match Score</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Timeline Card */}
            <Card>
              <div className="p-6">
                <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Timeline</h3>
                <div className="space-y-3">
                  <TimelineRow label="Applied" date={app.appliedAt} />
                  <TimelineRow label="Viewed" date={app.viewedAt} />
                  <TimelineRow label="Selected" date={app.selectedAt} />
                  <TimelineRow label="Offered" date={app.offeredAt} />
                  <TimelineRow label="Hired" date={app.hiredAt} />
                </div>
              </div>
            </Card>

            {/* Job Info */}
            {job && (
              <Card>
                <div className="p-6">
                  <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Job Details</h3>
                  <Tooltip content="View job details">
                    <Link
                      href={ROUTES.EMPLOYER.JOB_DETAIL(job.id)}
                      className="text-primary font-medium hover:underline"
                    >
                      {job.title}
                    </Link>
                  </Tooltip>
                  <div className="mt-2 space-y-1 text-sm text-[var(--text-light)]">
                    <p className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {job.company?.companyName}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Posted {formatRelativeDate(job.createdAt)}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Back to Applications */}
            <Tooltip content="Return to all applications">
              <Link href={ROUTES.EMPLOYER.APPLICATIONS}>
                <Button variant="outline" className="w-full" tooltip="Go back to applications list">
                  Back to Applications
                </Button>
              </Link>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      <Modal
        isOpen={rejectTarget}
        onClose={() => {
          setRejectTarget(false);
          setRejectionReason('');
        }}
        title="Reject Application"
      >
        <div className="space-y-4">
          <Textarea
            label="Rejection Reason"
            placeholder="Provide a reason for rejection (optional but recommended)"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(false);
                setRejectionReason('');
              }}
              tooltip="Cancel rejection"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              isLoading={updateStatus.isPending}
              tooltip="Confirm application rejection"
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

function TimelineRow({ label, date }: { label: string; date: string | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      {date ? (
        <span className="text-[var(--text)]">{formatDate(date)}</span>
      ) : (
        <span className="text-[var(--text-muted)]">-</span>
      )}
    </div>
  );
}
