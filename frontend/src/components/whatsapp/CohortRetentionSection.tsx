'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { whatsappService as svc } from '@/services/whatsapp.service';

const num = (n: number) => n.toLocaleString('en-IN');
const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** `2026-03-01` → `Mar 2026`. A month column reads as a month, not as a date. */
const monthLabel = (month: string) => {
  const d = new Date(`${month}T00:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? month
    : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const MONTH_OPTIONS = [
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
];

/**
 * Acquisition cohorts: contacts grouped by the month they were added, followed
 * through reply, retention, churn and revenue.
 *
 * Every other figure on this page is a window over events — "how many opt-outs
 * last month" — which cannot answer the question that decides whether an
 * acquisition channel is worth paying for: of the people added in March, how many
 * ever replied, how many are still talking to us, how many left, and what did
 * they spend. Read down a column here and that is the retention curve.
 *
 * Its own month control, deliberately independent of the page's day range: a
 * cohort curve drawn over seven days is a single point.
 */
export default function CohortRetentionSection({ channelId }: { channelId?: string }) {
  const [months, setMonths] = useState('6');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wa-analytics-cohorts', months, channelId ?? ''],
    queryFn: () => svc.getCohortReport(parseInt(months, 10), channelId),
    // Cached server-side for ten minutes; a cohort table does not move faster.
    refetchInterval: 10 * 60_000,
  });
  const report = data?.data ?? null;
  const rows = report?.rows ?? [];
  const hasContacts = rows.some((r) => r.contacts > 0);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-[var(--text)]">Acquisition cohorts</h2>
        </div>
        <div className="min-w-[170px]">
          <Select
            size="sm"
            clearable={false}
            value={months}
            onChange={setMonths}
            aria-label="Cohort window in months"
            options={MONTH_OPTIONS}
          />
        </div>
      </div>
      <p className="mb-4 text-[11px] text-[var(--text-muted)]">
        Contacts grouped by the month they were added, in {report?.tz ?? 'the reporting timezone'}.
        Replies and 30-day activity are read from each contact&apos;s own timestamps, so they
        survive the retention prune; the message volumes are counted from the messages still
        retained, and shrink for cohorts older than the retention window.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {isError && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-xs text-[var(--text-muted)]">Failed to load cohorts.</p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {report && !isError && !hasContacts && (
        <p className="text-xs text-[var(--text-muted)]">
          No contacts were added in this window, so there is no cohort to follow yet.
        </p>
      )}

      {report && !isError && hasContacts && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[var(--text-muted)]">
              <tr>
                <th className="py-1 pr-3 font-medium">Cohort</th>
                <th className="py-1 pr-3 text-right font-medium">Contacts</th>
                <th className="py-1 pr-3 text-right font-medium">Replied</th>
                <th className="py-1 pr-3 text-right font-medium">Active 30d</th>
                <th className="py-1 pr-3 text-right font-medium">Opted out</th>
                <th className="py-1 pr-3 text-right font-medium">Messages in</th>
                <th className="py-1 pr-3 text-right font-medium">Messages out</th>
                <th className="py-1 pr-3 text-right font-medium">Conversions</th>
                <th className="py-1 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.month} className="border-t border-[var(--border)]">
                  <td className="py-1.5 pr-3 font-medium text-[var(--text)]">
                    {monthLabel(c.month)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{num(c.contacts)}</td>
                  {/* Each rate sits beside its own count: a percentage over eleven
                      contacts is not a trend, and the reader has to be able to see
                      that for themselves. An empty month prints an em dash rather
                      than 0%, which would read as "nobody replied". */}
                  <td className="py-1.5 pr-3 text-right">
                    {c.contacts > 0 ? (
                      <>
                        {num(c.replied)}
                        <span className="ml-1 text-[var(--text-muted)]">({c.replyRate}%)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {c.contacts > 0 ? (
                      <>
                        {num(c.activeLast30)}
                        <span className="ml-1 text-[var(--text-muted)]">({c.retentionRate}%)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {c.contacts > 0 ? (
                      <>
                        {num(c.optedOut)}
                        <span className="ml-1 text-[var(--text-muted)]">({c.churnRate}%)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{num(c.inbound)}</td>
                  <td className="py-1.5 pr-3 text-right">{num(c.outbound)}</td>
                  <td className="py-1.5 pr-3 text-right">{num(c.conversions)}</td>
                  <td className="py-1.5 text-right text-[var(--text-muted)]">
                    {c.conversionValuePaise > 0 ? rupees(c.conversionValuePaise) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
