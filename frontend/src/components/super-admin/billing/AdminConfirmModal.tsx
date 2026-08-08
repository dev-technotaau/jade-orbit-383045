'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { AlertTriangle, Info } from 'lucide-react';

export interface AdminConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (input?: string) => Promise<void> | void;
  title: string;
  description?: React.ReactNode;
  /** When provided, requires the admin to type a reason/notes. */
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  inputMinLength?: number;
  inputMaxLength?: number;
  inputType?: 'text' | 'textarea';
  /** Visual tone of the confirm button. */
  intent?: 'danger' | 'primary' | 'warning';
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Enterprise-grade confirmation modal — replaces ad-hoc `confirm()` and
 * `prompt()` calls in super-admin pages. Supports an inline reason / notes
 * input, validation, async submission, and a focus-trapped Modal shell.
 */
export default function AdminConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  inputLabel,
  inputPlaceholder,
  inputRequired = true,
  inputMinLength = 2,
  inputMaxLength = 500,
  inputType = 'text',
  intent = 'primary',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}: AdminConfirmModalProps) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setValue('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  const requiresInput = Boolean(inputLabel);
  const trimmed = value.trim();
  const inputInvalid =
    requiresInput &&
    inputRequired &&
    (trimmed.length < inputMinLength || trimmed.length > inputMaxLength);

  const submit = async () => {
    if (inputInvalid) {
      setError(`Please enter ${inputMinLength}–${inputMaxLength} characters`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(requiresInput ? trimmed : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const ToneIcon = intent === 'danger' || intent === 'warning' ? AlertTriangle : Info;
  const toneClass =
    intent === 'danger'
      ? 'text-red-600'
      : intent === 'warning'
        ? 'text-amber-600'
        : 'text-blue-600';

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button
            variant={intent === 'danger' ? 'destructive' : 'primary'}
            onClick={submit}
            disabled={submitting || (requiresInput && inputRequired && inputInvalid)}
          >
            {submitting ? <Spinner /> : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <ToneIcon className={`mt-0.5 flex-shrink-0 ${toneClass}`} size={20} />
        <div className="flex-1">
          {description ? <div className="text-sm text-[var(--text)]">{description}</div> : null}

          {inputLabel ? (
            <div className="mt-4">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase">
                {inputLabel}
                {inputRequired ? <span className="text-red-500"> *</span> : null}
              </label>
              {inputType === 'textarea' ? (
                <textarea
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  rows={4}
                  maxLength={inputMaxLength}
                  placeholder={inputPlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 text-sm text-[var(--text)] focus:border-blue-500 focus:outline-none"
                  autoFocus
                  disabled={submitting}
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  maxLength={inputMaxLength}
                  placeholder={inputPlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 text-sm text-[var(--text)] focus:border-blue-500 focus:outline-none"
                  autoFocus
                  disabled={submitting}
                />
              )}
              {trimmed.length > 0 ? (
                <p className="mt-1 text-right text-xs text-[var(--text-secondary)]">
                  {trimmed.length}/{inputMaxLength}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
