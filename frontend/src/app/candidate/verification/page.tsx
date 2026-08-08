'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Fingerprint,
  Briefcase,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import FileUpload from '@/components/ui/FileUpload';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { verificationService } from '@/services/verification.service';
import { QUERY_KEYS, FILE_LIMITS } from '@/constants/config';
import { formatDate } from '@/lib/utils';
import type {
  VerificationRequest,
  VerificationType,
  VerificationStatus,
} from '@/types/verification';
import type { ApiError } from '@/types/api';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const typeOptions = [
  { value: 'IDENTITY', label: 'Identity Verification' },
  { value: 'EMPLOYMENT', label: 'Employment Verification' },
];

const typeDescriptions: Record<
  string,
  { description: string; documents: string; icon: typeof Fingerprint }
> = {
  IDENTITY: {
    description:
      'Verify your identity with a government-issued ID such as Aadhaar card, PAN card, passport, or driving license.',
    documents: 'Accepted: Aadhaar, PAN, Passport, Driving License (PDF, JPG, PNG)',
    icon: Fingerprint,
  },
  EMPLOYMENT: {
    description:
      'Verify your employment history with an offer letter, experience letter, or payslip from your employer.',
    documents: 'Accepted: Offer Letter, Experience Letter, Payslip (PDF, JPG, PNG)',
    icon: Briefcase,
  },
};

const statusConfig: Record<
  VerificationStatus,
  { label: string; variant: BadgeVariant; icon: typeof CheckCircle }
> = {
  PENDING: { label: 'Pending Review', variant: 'warning', icon: Clock },
  APPROVED: { label: 'Verified', variant: 'success', icon: CheckCircle },
  REJECTED: { label: 'Rejected', variant: 'error', icon: XCircle },
  REQUESTED_CHANGES: { label: 'Changes Requested', variant: 'info', icon: AlertCircle },
};

export default function CandidateVerificationPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<VerificationType>('IDENTITY');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.VERIFICATIONS.MINE,
    queryFn: () => verificationService.getMyVerifications(),
  });

  const verifications = data?.data || [];

  const submitMutation = useMutation({
    mutationFn: () => {
      return verificationService.requestVerification(
        selectedType,
        undefined,
        documentFile || undefined,
      );
    },
    onSuccess: () => {
      showToast.success('Verification request submitted successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.VERIFICATIONS.MINE });
      setShowForm(false);
      setDocumentFile(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to submit verification request');
    },
  });

  const handleSubmit = () => {
    if (!documentFile) {
      showToast.error('Please upload a supporting document');
      return;
    }
    submitMutation.mutate();
  };

  const hasPendingOfType = (type: string) =>
    verifications.some((v: VerificationRequest) => v.type === type && v.status === 'PENDING');

  const getTypeIcon = (type: VerificationType) => {
    const config = typeDescriptions[type];
    return config ? config.icon : FileText;
  };

  const getTypeLabel = (type: VerificationType) =>
    typeOptions.find((o) => o.value === type)?.label || type;

  const typeInfo = typeDescriptions[selectedType];

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Document Verification</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Submit identity and employment documents for verification by our team.
            </p>
          </div>
          {!showForm && (
            <Button
              onClick={() => setShowForm(true)}
              leftIcon={<ShieldCheck className="h-4 w-4" />}
              tooltip="Submit a new verification request"
            >
              New Request
            </Button>
          )}
        </div>

        {/* Request Form */}
        {showForm && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
              Submit Verification Request
            </h2>
            <div className="space-y-4">
              <Select
                label="Document Type"
                options={typeOptions}
                value={selectedType}
                onChange={(val) => {
                  setSelectedType(val as VerificationType);
                  setDocumentFile(null);
                }}
              />

              {/* Type-specific info */}
              {typeInfo && (
                <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                  <typeInfo.icon className="text-primary mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm text-[var(--text-secondary)]">{typeInfo.description}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{typeInfo.documents}</p>
                  </div>
                </div>
              )}

              {hasPendingOfType(selectedType) && (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-light)] p-3">
                  <Clock className="h-4 w-4 text-[var(--warning)]" />
                  <p className="text-sm text-[var(--warning)]">
                    You already have a pending {getTypeLabel(selectedType).toLowerCase()} request.
                  </p>
                </div>
              )}

              <FileUpload
                label="Upload Document"
                accept={{
                  'application/pdf': ['.pdf'],
                  'image/jpeg': ['.jpg', '.jpeg'],
                  'image/png': ['.png'],
                }}
                maxSize={FILE_LIMITS.RESUME_MAX_SIZE}
                onDrop={(files) => setDocumentFile(files[0] || null)}
                files={documentFile ? [documentFile] : []}
                onRemove={() => setDocumentFile(null)}
              />

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setDocumentFile(null);
                  }}
                  tooltip="Cancel verification request"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  isLoading={submitMutation.isPending}
                  disabled={hasPendingOfType(selectedType)}
                  leftIcon={<Upload className="h-4 w-4" />}
                  tooltip="Submit verification request"
                >
                  Submit
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Verification Requests List */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
            Your Verification Requests
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={80} />
              ))}
            </div>
          ) : verifications.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {verifications.map((v: VerificationRequest) => {
                const config = statusConfig[v.status];
                const StatusIcon = config.icon;
                const TypeIcon = getTypeIcon(v.type);
                return (
                  <div
                    key={v.id}
                    className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-[var(--bg-secondary)] p-2">
                        <TypeIcon className="h-5 w-5 text-[var(--text-secondary)]" />
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text)]">{getTypeLabel(v.type)}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Submitted {formatDate(v.createdAt)}
                        </p>
                        {v.reviewedAt && (
                          <p className="text-xs text-[var(--text-muted)]">
                            Reviewed {formatDate(v.reviewedAt)}
                          </p>
                        )}
                        {v.adminComments && (
                          <div className="mt-2 rounded-md bg-[var(--bg-secondary)] p-2.5 text-sm text-[var(--text-secondary)]">
                            <span className="font-medium">Reviewer feedback: </span>
                            {v.adminComments}
                          </div>
                        )}
                        {v.documentUrl && (
                          <Tooltip content="Open document in new tab">
                            <a
                              href={v.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                            >
                              <FileText className="h-3 w-3" />
                              View uploaded document
                            </a>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    <Badge variant={config.variant} size="sm">
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="No verification requests"
              description="Submit your identity or employment documents for verification."
              action={
                <Button
                  onClick={() => setShowForm(true)}
                  size="sm"
                  tooltip="Submit a new verification request"
                >
                  Submit Request
                </Button>
              }
            />
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
