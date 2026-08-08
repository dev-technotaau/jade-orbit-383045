/**
 * Admin detail card — a left/right key/value table commonly used across
 * super-admin detail pages. Keeps super-admin UIs visually consistent.
 */
interface Row {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

interface Props {
  title?: string;
  rows: Row[];
}

export default function AdminDetailCard({ title, rows }: Props) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      {title ? (
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
          {title}
        </h3>
      ) : null}
      <dl className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-1 border-b border-[var(--border)] pb-2 last:border-0 last:pb-0 sm:grid-cols-3 sm:gap-3"
          >
            <dt className="text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase sm:col-span-1">
              {r.label}
            </dt>
            <dd
              className={`text-sm text-[var(--text)] sm:col-span-2 ${r.mono ? 'font-mono break-all' : ''}`}
            >
              {r.value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
