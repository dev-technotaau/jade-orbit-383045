import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface Props {
  title?: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export default function EmptyState({
  title = 'No data yet',
  description,
  icon: Icon = Inbox,
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-10 text-center">
      <Icon className="mb-3 text-[var(--text-secondary)]" size={32} />
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-xs text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
