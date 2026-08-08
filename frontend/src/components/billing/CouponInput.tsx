'use client';

import { useState } from 'react';
import { Tag, X, CheckCircle2, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { couponService, type ValidatedCouponDTO } from '@/services/coupon.service';
import { formatPaise } from '@/types/billing';
import type { ApiError } from '@/types/api';

interface CouponInputProps {
  planCode: string;
  orderAmountPaise: number;
  currency?: string;
  applied: ValidatedCouponDTO | null;
  onApply: (coupon: ValidatedCouponDTO) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export default function CouponInput({
  planCode,
  orderAmountPaise,
  currency = 'INR',
  applied,
  onApply,
  onRemove,
  disabled,
}: CouponInputProps) {
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidate() {
    if (!code.trim()) return;
    setValidating(true);
    setError(null);
    try {
      const validated = await couponService.validate({
        code: code.trim().toUpperCase(),
        planCode,
        orderAmountPaise,
      });
      onApply(validated);
      setCode('');
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      // The Zod validate middleware returns a generic
      // "Validation failed" envelope for shape errors (e.g. user
      // typed a 1-2 char code → backend min(3) trips). Surface that
      // as a coupon-friendly message instead of the developer-facing
      // string. All other backend errors (NotFoundError /
      // BadRequestError from coupon.service) already ship clear,
      // user-readable messages so we forward them as-is.
      const isValidationShapeError =
        apiErr?.code === 'VALIDATION_ERROR' ||
        apiErr?.message?.toLowerCase() === 'validation failed';
      const friendly = isValidationShapeError
        ? 'Invalid coupon code. Please check and try again.'
        : (apiErr?.message ?? 'Invalid coupon');
      setError(friendly);
    } finally {
      setValidating(false);
    }
  }

  if (applied) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-green-700" />
            <div>
              <p className="text-sm font-semibold text-green-900">{applied.code} applied</p>
              <p className="text-xs text-green-800">
                You save {formatPaise(applied.discountPaise, currency)}
                {applied.trialExtendDays && ` · +${applied.trialExtendDays} trial days`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onRemove();
              setError(null);
            }}
            disabled={disabled}
            className="text-green-700 hover:text-green-900"
            aria-label="Remove coupon"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs font-medium text-[var(--text-muted)]">Have a coupon?</label>
      <div className="mt-1 flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            disabled={disabled || validating}
            className="w-full rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-9 text-sm tracking-wider uppercase focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleValidate();
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          size="md"
          onClick={() => void handleValidate()}
          isLoading={validating}
          disabled={disabled || !code.trim()}
        >
          Apply
        </Button>
      </div>
      {error && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--error)]">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
