'use client';

import { cn } from '@/lib/utils';
import { getPasswordStrength } from '@/utils/validation';

interface PasswordStrengthProps {
  password: string;
}

const colorMap: Record<string, string> = {
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
  success: 'bg-success',
};

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;

  const { score, label, color } = getPasswordStrength(password);
  const maxScore = 6;
  const percentage = (score / maxScore) * 100;

  return (
    <div className="mt-2">
      <div className="mb-1 h-1.5 w-full rounded-full bg-[var(--bg-tertiary)]">
        <div
          className={cn('h-full rounded-full transition-all duration-300', colorMap[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className={cn('text-xs', `text-${color}`)}>Password strength: {label}</p>
    </div>
  );
}
