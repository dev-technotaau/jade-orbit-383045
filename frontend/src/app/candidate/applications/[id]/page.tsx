'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, notFound } from 'next/navigation';
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
  IndianRupee,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { useApplication, useWithdrawApplication } from '@/hooks/use-jobs';
import { ROUTES } from '@/constants/routes';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
  JOB_TYPE_LABELS,
  WORK_MODE_LABELS,
} from '@/constants/enums';
import { formatDate, formatRelativeDate, formatSalaryRange } from '@/lib/utils';
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

function canWithdraw(status: string): boolean {
  return ['APPLIED', 'VIEWED', 'SHORTLISTED', 'SELECTED'].includes(status);
}

export default function CandidateApplicationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = useApplication(id);
  const withdrawMutation = useWithdrawApplication();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['CANDIDATE']}>
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
  const currentStepIndex = STATUS_ORDER[app.status] ?? -1;
  const isTerminal = ['REJECTED', 'WITHDRAWN'].includes(app.status);

  const handleWithdraw = () => {
    withdrawMutation.mutate(app.id, {
      onSuccess: () => {
        showToast.success('Application withdrawn successfully');
        setShowWithdrawModal(false);
      },
      onError: (err) => {
        const apiErr = err as unknown as ApiError;
        showToast.error(apiErr.message || 'Failed to withdraw application');
      },
    });
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Tooltip content="Back to applications">
            <Link
              href={ROUTES.CANDIDATE.APPLICATIONS}
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
            {/* Job Info */}
            {job && (
              <Card>
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {job.company?.logo ? (
                      <img
                        src={job.company.logo}
                        alt={job.company.companyName}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-lg">
                        <Building2 className="text-primary h-6 w-6" />
                      </div>
                    )}
                    <div className="flex-1">
                      <Tooltip content={`View full details for ${job.title}`}>
                        <Link
                          href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}
                          className="hover:text-primary text-lg font-semibold text-[var(--text)]"
                        >
                          {job.title}
                        </Link>
                      </Tooltip>
                      <p className="text-sm text-[var(--text-muted)]">{job.company?.companyName}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-light)]">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5" />
                          {JOB_TYPE_LABELS[job.type] || job.type}
                        </span>
                        {job.workMode && (
                          <span>{WORK_MODE_LABELS[job.workMode] || job.workMode}</span>
                        )}
                        {(job.salaryMin || job.salaryMax) && (
                          <span className="flex items-center gap-1">
                            <IndianRupee className="h-3.5 w-3.5" />
                            {formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                          </span>
                        )}
                      </div>
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
                        <p className="text-sm font-medium text-[var(--text)]">
                          {idx + 1}. {sa.question.question}
                        </p>
                        <p className="mt-2 text-sm text-[var(--text-light)]">{sa.answer}</p>
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
            {/* Status Card */}
            <Card>
              <div className="p-6 text-center">
                <Badge
                  variant={statusColorMap[APPLICATION_STATUS_COLORS[app.status]] || 'neutral'}
                  size="md"
                >
                  {APPLICATION_STATUS_LABELS[app.status]}
                </Badge>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Applied on {formatDate(app.appliedAt)}
                </p>
                {app.matchScore != null && (
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-sm">
                    <Star className="h-4 w-4 text-[var(--warning)]" />
                    <span className="font-medium text-[var(--text)]">
                      {Math.round(app.matchScore)}% Match
                    </span>
                  </div>
                )}
              </div>
            </Card>

            {/* Timeline Card */}
            <Card>
              <div className="p-6">
                <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Timeline</h3>
                <div className="space-y-3">
                  <TimelineRow label="Applied" date={app.appliedAt} />
                  <TimelineRow label="Viewed by employer" date={app.viewedAt} />
                  <TimelineRow label="Selected" date={app.selectedAt} />
                  <TimelineRow label="Offered" date={app.offeredAt} />
                  <TimelineRow label="Hired" date={app.hiredAt} />
                </div>
              </div>
            </Card>

            {/* Offer Details */}
            {app.offerDetails && (
              <Card>
                <div className="p-6">
                  <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Offer Details</h3>
                  <div className="space-y-2 text-sm">
                    {app.offerDetails.designation && (
                      <p className="text-[var(--text-light)]">
                        <span className="font-medium text-[var(--text)]">Role:</span>{' '}
                        {app.offerDetails.designation}
                      </p>
                    )}
                    {app.offerDetails.salary && (
                      <p className="text-[var(--text-light)]">
                        <span className="font-medium text-[var(--text)]">Salary:</span>{' '}
                        {app.offerDetails.salary}
                      </p>
                    )}
                    {app.offerDetails.location && (
                      <p className="text-[var(--text-light)]">
                        <span className="font-medium text-[var(--text)]">Location:</span>{' '}
                        {app.offerDetails.location}
                      </p>
                    )}
                    {app.offerDetails.joiningDate && (
                      <p className="text-[var(--text-light)]">
                        <span className="font-medium text-[var(--text)]">Joining Date:</span>{' '}
                        {app.offerDetails.joiningDate}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Rejection Card */}
            {app.status === 'REJECTED' && app.rejectionReason && (
              <Card>
                <div className="p-6">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--error)]">
                    <XCircle className="h-4 w-4" />
                    Rejection Reason
                  </h3>
                  <p className="text-sm text-[var(--text-light)]">{app.rejectionReason}</p>
                </div>
              </Card>
            )}

            {/* Actions */}
            <Card>
              <div className="space-y-3 p-6">
                {canWithdraw(app.status) && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowWithdrawModal(true)}
                    tooltip="Withdraw this application"
                  >
                    Withdraw Application
                  </Button>
                )}
                <Link href={ROUTES.CANDIDATE.APPLICATIONS}>
                  <Button variant="outline" className="w-full" tooltip="Back to applications list">
                    Back to Applications
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      <Modal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        title="Withdraw Application"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-light)]">
            Are you sure you want to withdraw your application for{' '}
            <span className="font-medium text-[var(--text)]">{job?.title}</span>? This action cannot
            be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowWithdrawModal(false)}
              tooltip="Cancel withdrawal"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleWithdraw}
              isLoading={withdrawMutation.isPending}
              tooltip="Confirm withdrawal"
            >
              Withdraw
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
