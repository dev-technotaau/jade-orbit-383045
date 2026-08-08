import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  subtitle?: string;
  delta?: { value: number; direction: 'up' | 'down'; suffix?: string };
  intent?: 'default' | 'positive' | 'negative' | 'warning';
}

const TONE: Record<NonNullable<Props['intent']>, string> = {
  default: 'border-[var(--border)] bg-[var(--bg-secondary)]',
  positive: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20',
  negative: 'border-red-200 bg-red-50 dark:bg-red-900/20',
  warning: 'border-amber-200 bg-amber-50 dark:bg-amber-900/20',
};

export default function MetricCard({ label, value, subtitle, delta, intent = 'default' }: Props) {
  const Icon = delta?.direction === 'up' ? TrendingUp : TrendingDown;
  return (
    <div className={`rounded-xl border p-5 ${TONE[intent]}`}>
      <p className="text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[var(--text)]">{value}</p>
      {delta ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <Icon
            size={12}
            className={delta.direction === 'up' ? 'text-emerald-600' : 'text-red-600'}
          />
          <span
            className={`font-medium ${
              delta.direction === 'up' ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {delta.value}
            {delta.suffix ?? '%'}
          </span>
          {subtitle ? <span className="text-[var(--text-secondary)]">{subtitle}</span> : null}
        </div>
      ) : subtitle ? (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{subtitle}</p>
      ) : null}
    </div>
  );
}
