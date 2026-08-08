'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Textarea from '@/components/ui/Textarea';
import { verificationService } from '@/services/verification.service';
import type { ApiError } from '@/types/api';

export default function VerifyEmploymentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const initialAction = searchParams.get('action') as 'confirm' | 'deny' | null;

  const [action, setAction] = useState<'confirm' | 'deny'>(initialAction || 'confirm');
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      verificationService.submitEmploymentResponse(token, action, comments || undefined),
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] p-4">
        <Card className="max-w-md text-center">
          <div className="p-8">
            <CheckCircle className="mx-auto h-12 w-12 text-[var(--success)]" />
            <h1 className="mt-4 text-xl font-bold text-[var(--text)]">Response Submitted</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Thank you for your response. The candidate has been notified.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] p-4">
      <Card className="w-full max-w-lg">
        <div className="p-8">
          <div className="text-center">
            <ShieldCheck className="text-primary mx-auto h-10 w-10" />
            <h1 className="mt-3 text-xl font-bold text-[var(--text)]">Employment Verification</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Hire Adda has requested your help to verify a former employee&apos;s work history.
              Please confirm or deny the employment details below.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex gap-3">
              <Tooltip content="Confirm the candidate's employment details are accurate">
                <button
                  onClick={() => setAction('confirm')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                    action === 'confirm'
                      ? 'border-[var(--success)] bg-[var(--success-light)] text-[var(--success-dark)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--success)]'
                  }`}
                >
                  <CheckCircle className="h-5 w-5" />
                  Confirm Employment
                </button>
              </Tooltip>
              <Tooltip content="Report the employment details as inaccurate">
                <button
                  onClick={() => setAction('deny')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                    action === 'deny'
                      ? 'border-[var(--error)] bg-[var(--error-light)] text-[var(--error-dark)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--error)]'
                  }`}
                >
                  <XCircle className="h-5 w-5" />
                  Deny / Inaccurate
                </button>
              </Tooltip>
            </div>

            <Textarea
              label="Comments (optional)"
              placeholder={
                action === 'confirm'
                  ? 'Any additional details...'
                  : 'Please explain what is inaccurate...'
              }
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
            />

            {mutation.isError && (
              <p className="text-error text-sm">
                {(mutation.error as unknown as ApiError)?.message ||
                  'Something went wrong. Please try again.'}
              </p>
            )}

            <Button
              className="w-full"
              variant={action === 'confirm' ? 'primary' : 'destructive'}
              onClick={() => mutation.mutate()}
              isLoading={mutation.isPending}
              tooltip={action === 'confirm' ? 'Submit your confirmation' : 'Submit your denial'}
            >
              {action === 'confirm' ? 'Confirm Employment' : 'Deny Employment'}
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            This is a one-time verification request from Hire Adda. Your response will help us
            maintain accurate employment records.
          </p>
        </div>
      </Card>
    </div>
  );
}
