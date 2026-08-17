'use client';

import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import type { AuditEntry, IntegrityState } from '@/services/audit.service';
import { cn } from '@/lib/utils';

/**
 * One audit entry, rendered in full.
 *
 * Shared by the trail’s detail modal and the standalone `/whatsapp/audit/[id]`
 * page so the two can never drift into showing different fields for the same
 * row — which matters more here than elsewhere: this is the view an
 * investigation is read from.
 */
export default function AuditEntryDetail({ entry }: { entry: AuditEntry }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-[var(--text)]">{entry.action}</span>
        <IntegrityBadge state={entry.integrity} />
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="When" value={new Date(entry.createdAt).toLocaleString()} />
        <Field label="Actor" value={entry.performedBy ?? '—'} />
        <Field label="Entity" value={entry.entity} />
        <Field label="Entity id" value={entry.entityId ?? '—'} mono />
        <Field label="IP address" value={entry.ipAddress ?? '—'} mono />
        <Field label="Entry id" value={entry.id} mono />
        <Field label="User agent" value={entry.userAgent ?? '—'} className="sm:col-span-2" />
      </dl>

      <div>
        <p className="mb-1 text-sm font-medium text-[var(--text)]">Details</p>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          Message bodies, notes and other free text are redacted before an entry is written — this
          records that an action happened, never what was said.
        </p>
        <pre className="max-h-72 overflow-auto rounded-lg bg-[var(--bg-secondary)] p-3 text-xs text-[var(--text)]">
          {JSON.stringify(entry.details ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className={cn('break-all text-[var(--text)]', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

/** Says whether the row still hashes to the checksum stored with it. */
export function IntegrityBadge({ state }: { state: IntegrityState }) {
  const map = {
    valid: {
      icon: ShieldCheck,
      text: 'Verified',
      cls: 'bg-emerald-50 text-emerald-700',
      title: 'This entry still matches the checksum recorded when it was written.',
    },
    invalid: {
      icon: ShieldAlert,
      text: 'Altered',
      cls: 'bg-red-50 text-red-700',
      title:
        'This entry no longer matches its checksum — it has been modified since it was written.',
    },
    unverifiable: {
      icon: ShieldQuestion,
      text: 'No checksum',
      cls: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
      title: 'Written before checksums existed, so it can be neither confirmed nor doubted.',
    },
  } as const;

  const { icon: Icon, text, cls, title } = map[state];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        cls,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {text}
    </span>
  );
}
