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
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import FileUpload from '@/components/ui/FileUpload';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
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
  { value: 'GST', label: 'GST Verification' },
  { value: 'EMPLOYMENT', label: 'Employment Verification' },
  { value: 'IDENTITY', label: 'Identity Verification' },
];

const statusConfig: Record<
  VerificationStatus,
  { label: string; variant: BadgeVariant; icon: typeof CheckCircle }
> = {
  PENDING: { label: 'Pending', variant: 'warning', icon: Clock },
  APPROVED: { label: 'Approved', variant: 'success', icon: CheckCircle },
  REJECTED: { label: 'Rejected', variant: 'error', icon: XCircle },
  REQUESTED_CHANGES: { label: 'Changes Requested', variant: 'info', icon: AlertCircle },
};

export default function VerificationPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<VerificationType>('GST');
  const [gstNumber, setGstNumber] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.VERIFICATIONS.MINE,
    queryFn: () => verificationService.getMyVerifications(),
  });

  const verifications = data?.data || [];

  const submitMutation = useMutation({
    mutationFn: () => {
      const extraData: Record<string, unknown> = {};
      if (selectedType === 'GST' && gstNumber) extraData.gstNumber = gstNumber;
      return verificationService.requestVerification(
        selectedType,
        Object.keys(extraData).length > 0 ? extraData : undefined,
        documentFile || undefined,
      );
    },
    onSuccess: () => {
      showToast.success('Verification request submitted successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.VERIFICATIONS.MINE });
      setShowForm(false);
      setGstNumber('');
      setDocumentFile(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to submit verification request');
    },
  });

  const handleSubmit = () => {
    if (selectedType === 'GST' && !gstNumber.trim()) {
      showToast.error('Please enter your GST number');
      return;
    }
    submitMutation.mutate();
  };

  const getTypeLabel = (type: VerificationType) =>
    typeOptions.find((o) => o.value === type)?.label || type;

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Verification</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Verify your business credentials to build trust with candidates.
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
                label="Verification Type"
                options={typeOptions}
                value={selectedType}
                onChange={(val) => setSelectedType(val as VerificationType)}
              />
              {selectedType === 'GST' && (
                <Input
                  label="GST Number"
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  required
                />
              )}
              <FileUpload
                label="Supporting Document"
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
                  leftIcon={<Upload className="h-4 w-4" />}
                  tooltip="Submit verification request for review"
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
                return (
                  <div
                    key={v.id}
                    className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-[var(--bg-secondary)] p-2">
                        <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text)]">{getTypeLabel(v.type)}</p>
                        {v.type === 'GST' && v.data && (
                          <p className="text-sm text-[var(--text-muted)]">
                            GST: {(v.data as Record<string, string>).gstNumber || 'N/A'}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Submitted {formatDate(v.createdAt)}
                        </p>
                        {v.adminComments && (
                          <p className="mt-2 rounded-md bg-[var(--bg-secondary)] p-2 text-sm text-[var(--text-secondary)]">
                            <span className="font-medium">Admin: </span>
                            {v.adminComments}
                          </p>
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
              description="Submit a verification request to build trust with candidates."
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
